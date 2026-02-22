const UNKNOWN_LOCATION = "Unknown location";
const LOADING_LOCATION = "Loading address...";
const PERSISTENT_CACHE_KEY = "location_timeline_reverse_geocode_cache_v1";
const MAX_PERSISTENT_CACHE_ENTRIES = 300;

let reverseGeocodingConfig = {
    nominatim_reverse_url: "https://nominatim.openstreetmap.org/reverse",
    request_interval_ms: 1000,
};
const queuedRequests = [];
let queuedSegments = new WeakSet();
let queueRunning = false;
let lastRequestAt = 0;
let queueSession = 0;
const persistentCache = loadPersistentCache();


export function clearReverseGeocodingQueue() {
    queueSession += 1;

    const callbacks = new Set();
    for (const request of queuedRequests) {
        request.segment.placeName = UNKNOWN_LOCATION;
        request.segment.reverseGeocoding = null;
        callbacks.add(request.onUpdate);
    }

    queuedRequests.length = 0;
    queuedSegments = new WeakSet();

    for (const callback of callbacks) {
        callback();
    }
}

export function resolveStaySegments(segments, options) {
    const {
        placeStates = [],
        date,
        osmApiKey = null,
        onUpdate = () => {},
    } = options;
    const placeIntervals = placeStates.length
        ? buildPlaceIntervals([...placeStates].sort((a, b) => a.ts - b.ts), date)
        : [];

    for (const segment of segments) {
        if (segment.type !== "stay" || segment.zoneName) continue;
        if (segment.placeName && segment.placeName !== LOADING_LOCATION) continue;

        const segmentKey = toPersistentCacheKey(segment);
        const cached = persistentCache.get(segmentKey);
        if (cached) {
            segment.placeName = cached.placeName;
            segment.reverseGeocoding = cached.reverseGeocoding;
            continue;
        }

        const placeName = pickPlaceName(placeIntervals, segment.start, segment.end);
        if (placeName) {
            segment.placeName = placeName;
            segment.reverseGeocoding = {source: "places", name: placeName};
            setPersistentCache(segmentKey, segment.placeName, segment.reverseGeocoding);
            continue;
        }

        if (!osmApiKey) {
            segment.placeName = UNKNOWN_LOCATION;
            segment.reverseGeocoding = null;
            setPersistentCache(segmentKey, segment.placeName, segment.reverseGeocoding);
            continue;
        }

        segment.placeName = LOADING_LOCATION;
        segment.reverseGeocoding = null;
        enqueueReverseLookup(segment, segmentKey, osmApiKey, onUpdate);
    }
}

function enqueueReverseLookup(segment, segmentKey, osmApiKey, onUpdate) {
    if (queuedSegments.has(segment)) return;
    queuedSegments.add(segment);
    queuedRequests.push({segment, segmentKey, osmApiKey, onUpdate, retriesLeft: 3});
    processQueue();
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    const sessionAtStart = queueSession;

    try {
        while (queuedRequests.length && sessionAtStart === queueSession) {
            const waitMs = reverseGeocodingConfig.request_interval_ms - (Date.now() - lastRequestAt);
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
    const {segment, segmentKey, osmApiKey, onUpdate, retriesLeft} = request;
    if (sessionAtStart !== queueSession) return;
    let name = UNKNOWN_LOCATION;
    let result = null;

    try {
        const url = new URL(reverseGeocodingConfig.nominatim_reverse_url);
        url.searchParams.set("format", "geocodejson");
        url.searchParams.set("lat", String(segment.center.lat));
        url.searchParams.set("lon", String(segment.center.lon));
        url.searchParams.set("email", osmApiKey);

        const response = await fetch(url.toString());

        if (!response.ok) {
            if (retriesLeft > 0) {
                queuedRequests.push({...request, retriesLeft: retriesLeft - 1});
                return;
            }
        } else {
            result = await response.json();
            const features = result.features?.[0]?.properties?.geocoding || {};
            const houseNumber = features.housenumber ? ` ${features.housenumber}` : "";
            const formatted_address = features.street ? `${features.street}${houseNumber}, ${features.city}` : null
            const formatted_locality = features.locality ? `${features.locality}, ${features.city}` : null
            name = features.name || formatted_address || formatted_locality || features.label || UNKNOWN_LOCATION;
        }
    } catch (error) {
        if (retriesLeft > 0) {
            queuedRequests.push({...request, retriesLeft: retriesLeft - 1});
            return;
        }
    }

    if (sessionAtStart !== queueSession) return;

    queuedSegments.delete(segment);
    segment.placeName = name;
    segment.reverseGeocoding = result;
    setPersistentCache(segmentKey, segment.placeName, segment.reverseGeocoding);
    onUpdate();
}

function buildPlaceIntervals(placeStates, date) {
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    return placeStates.map((state, index) => {
        const next = placeStates[index + 1];
        const end = next ? next.ts : endOfDay;
        const name = placeDisplayName(state);
        return {
            start: state.ts,
            end,
            name,
        };
    });
}

function placeDisplayName(state) {
    const attrs = state.attributes || {};
    const formatted_address = attrs.street ? `${attrs.street} ${attrs.street_number || ''}, ${attrs.city}` : null
    return attrs.place_name || formatted_address || state.state || attrs.formatted_address || null;
}

function pickPlaceName(intervals, start, end) {
    const counts = new Map();
    for (const interval of intervals) {
        const overlapMs = Math.min(end, interval.end) - Math.max(start, interval.start);
        if (overlapMs <= 0 || !interval.name) continue;
        counts.set(interval.name, (counts.get(interval.name) || 0) + overlapMs);
    }

    let best = null;
    let bestMs = 0;
    for (const [name, ms] of counts.entries()) {
        if (ms > bestMs) {
            best = name;
            bestMs = ms;
        }
    }
    return best;
}


function toPersistentCacheKey(segment) {
    const lat = Number(segment?.center?.lat);
    const lon = Number(segment?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return `${lat.toFixed(5)},${lon.toFixed(5)}`;
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

function setPersistentCache(key, placeName, reverseGeocoding) {
    if (!key) return;
    persistentCache.set(key, {placeName, reverseGeocoding});

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
