import {haversineMeters, sleep} from "./utils.js";

const OSRM_BASE_URL = "https://router.project-osrm.org";
const PERSISTENT_CACHE_KEY = "location_timeline_osrm_cache_v1";
const MAX_PERSISTENT_CACHE_ENTRIES = 200;
const MAX_COORDINATES = 10;
const REQUEST_INTERVAL_MS = 1000;

const queuedRequests = [];
let queuedSegments = new WeakSet();
let queueRunning = false;
let lastRequestAt = 0;
let queueSession = 0;
const persistentCache = loadPersistentCache();

export function clearOsrmQueue() {
    queueSession += 1;
    queuedRequests.length = 0;
    queuedSegments = new WeakSet();
}

export function snapMoveSegments(segments, onUpdate) {
    for (const segment of segments) {
        if (segment.type !== "move") continue;
        if (!Array.isArray(segment.points) || segment.points.length < 2) continue;

        const segmentKey = toCacheKey(segment);
        if (!segmentKey) continue;

        const cached = persistentCache.get(segmentKey);
        if (cached) {
            segment.points = assignTimestamps(cached.coords, segment.start, segment.end);
            segment.distanceM = cached.distanceM;
            continue;
        }

        enqueueOsrmRequest(segment, segmentKey, onUpdate);
    }
}

function enqueueOsrmRequest(segment, segmentKey, onUpdate) {
    if (queuedSegments.has(segment)) return;
    queuedSegments.add(segment);
    queuedRequests.push({segment, segmentKey, onUpdate, retriesLeft: 3});
    processQueue();
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    const sessionAtStart = queueSession;

    try {
        while (queuedRequests.length && sessionAtStart === queueSession) {
            const waitMs = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
            if (waitMs > 0) await sleep(waitMs);

            const request = queuedRequests.shift();
            if (!request) continue;
            lastRequestAt = Date.now();
            await resolveQueuedRequest(request, sessionAtStart);
        }
    } finally {
        queueRunning = false;
    }
}

async function resolveQueuedRequest(request, sessionAtStart) {
    if (!request) return;
    const {segment, segmentKey, onUpdate, retriesLeft} = request;
    if (sessionAtStart !== queueSession) return;

    const sampledPoints = downsample(segment.points, MAX_COORDINATES);
    const coords = sampledPoints.map((p) => `${p.point[1]},${p.point[0]}`).join(";");
    const timestamps = sampledPoints
        .map((p) => Math.round((p.timestamp instanceof Date ? p.timestamp.getTime() : p.timestamp) / 1000))
        .join(";");

    try {
        const url = new URL(`${OSRM_BASE_URL}/match/v1/driving/${coords}`);
        url.searchParams.set("timestamps", timestamps);
        url.searchParams.set("geometries", "geojson");
        url.searchParams.set("overview", "full");
        url.searchParams.set("annotations", "false");
        url.searchParams.set("gaps", "ignore")

        const response = await fetch(url.toString());

        if (!response.ok) {
            if (retriesLeft > 0) {
                queuedRequests.push({...request, retriesLeft: retriesLeft - 1});
            }
            return;
        }

        const data = await response.json();
        if (data.code !== "Ok" || !Array.isArray(data.matchings) || data.matchings.length === 0) {
            return;
        }

        if (sessionAtStart !== queueSession) return;

        const matching = data.matchings[0];
        const coordinates = matching.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length === 0) return;

        // GeoJSON uses [lon, lat] order — convert to internal [lat, lon]
        const snappedCoords = coordinates.map(([lon, lat]) => [lat, lon]);
        const distanceM = typeof matching.distance === "number" ? matching.distance : segment.distanceM;

        setPersistentCache(segmentKey, snappedCoords, distanceM);

        queuedSegments.delete(segment);
        segment.points = assignTimestamps(snappedCoords, segment.start, segment.end);
        segment.distanceM = distanceM;
        onUpdate();
    } catch {
        if (retriesLeft > 0) {
            queuedRequests.push({...request, retriesLeft: retriesLeft - 1});
        }
    }
}

function downsample(points, maxCount) {
    if (points.length <= maxCount) return points;
    const result = [];
    for (let i = 0; i < maxCount; i++) {
        const index = Math.round((i / (maxCount - 1)) * (points.length - 1));
        result.push(points[index]);
    }
    return result;
}

function assignTimestamps(coords, start, end) {
    const startMs = start instanceof Date ? start.getTime() : Number(start);
    const endMs = end instanceof Date ? end.getTime() : Number(end);
    const n = coords.length;
    if (n === 0) return [];

    const distances = [0];
    for (let i = 1; i < n; i++) {
        const d = haversineMeters(
            {lat: coords[i - 1][0], lon: coords[i - 1][1]},
            {lat: coords[i][0], lon: coords[i][1]},
        );
        distances.push(distances[i - 1] + d);
    }
    const totalDist = distances[n - 1];
    const totalTime = endMs - startMs;

    return coords.map((point, i) => ({
        point,
        timestamp: new Date(
            startMs +
                (totalDist > 0 ? (distances[i] / totalDist) * totalTime : (i / Math.max(n - 1, 1)) * totalTime),
        ),
    }));
}

function toCacheKey(segment) {
    const points = segment.points;
    if (!Array.isArray(points) || points.length < 2) return null;
    const first = points[0].point;
    const last = points[points.length - 1].point;
    if (!Array.isArray(first) || !Array.isArray(last)) return null;
    return `${first[0].toFixed(4)},${first[1].toFixed(4)}|${last[0].toFixed(4)},${last[1].toFixed(4)}|${points.length}`;
}

function loadPersistentCache() {
    try {
        const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
        if (!raw) return new Map();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Map();
        return new Map(parsed);
    } catch {
        return new Map();
    }
}

function setPersistentCache(key, coords, distanceM) {
    if (!key) return;
    persistentCache.set(key, {coords, distanceM});

    while (persistentCache.size > MAX_PERSISTENT_CACHE_ENTRIES) {
        const firstKey = persistentCache.keys().next().value;
        if (firstKey === undefined) break;
        persistentCache.delete(firstKey);
    }

    try {
        localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify([...persistentCache.entries()]));
    } catch {
        // ignore storage errors
    }
}

export function clearOsrmCache() {
    persistentCache.clear();
    localStorage.removeItem(PERSISTENT_CACHE_KEY);
}
