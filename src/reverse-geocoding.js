const UNKNOWN_LOCATION = "Unknown location";
const LOADING_LOCATION = "Loading address...";

const geocodeCache = new Map();
const defaultReverseGeocodingConfig = {
    nominatim_reverse_url: "https://nominatim.openstreetmap.org/reverse",
    request_interval_ms: 1000,
};
let reverseGeocodingConfig = defaultReverseGeocodingConfig;
let configLoaded = false;
const queuedRequests = [];
const pendingByKey = new Map();
let queueRunning = false;
let lastRequestAt = 0;

export function resolveStaySegments(segments, options) {
    const {placeStates = [], date, osmApiKey = null, onUpdate = () => {}} = options;
    const placeIntervals = placeStates.length
        ? buildPlaceIntervals([...placeStates].sort((a, b) => a.ts - b.ts), date)
        : [];

    for (const segment of segments) {
        if (segment.type !== "stay" || segment.zoneName) continue;

        const key = toCacheKey(segment.center);
        const cached = geocodeCache.get(key);

        if (cached?.status === "ready") {
            segment.placeName = cached.name;
            segment.reverseGeocoding = cached.result;
            continue;
        }

        const placeName = placeIntervals.length
            ? pickPlaceName(placeIntervals, segment.start, segment.end)
            : null;
        if (placeName) {
            const result = {source: "places", name: placeName};
            geocodeCache.set(key, {status: "ready", name: placeName, result});
            segment.placeName = placeName;
            segment.reverseGeocoding = result;
            continue;
        }

        if (!osmApiKey) {
            cacheUnknown(key);
            segment.placeName = UNKNOWN_LOCATION;
            segment.reverseGeocoding = null;
            continue;
        }

        segment.placeName = LOADING_LOCATION;
        segment.reverseGeocoding = null;
        enqueueReverseLookup(segment, key, osmApiKey, onUpdate);
    }
}

function enqueueReverseLookup(segment, key, osmApiKey, onUpdate) {
    let pending = pendingByKey.get(key);
    if (!pending) {
        pending = {segments: new Set(), callbacks: new Set()};
        pendingByKey.set(key, pending);
    }
    pending.segments.add(segment);
    pending.callbacks.add(onUpdate);

    if (geocodeCache.get(key)?.status === "loading") {
        return;
    }

    geocodeCache.set(key, {status: "loading", name: LOADING_LOCATION, result: null});
    queuedRequests.push({
        key,
        lat: segment.center.lat,
        lon: segment.center.lon,
        osmApiKey,
    });
    processQueue();
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;

    try {
        await ensureReverseGeocodingConfig();
        while (queuedRequests.length) {
            const waitMs = reverseGeocodingConfig.request_interval_ms - (Date.now() - lastRequestAt);
            if (waitMs > 0) {
                await sleep(waitMs);
            }

            const request = queuedRequests.shift();
            lastRequestAt = Date.now();
            await resolveQueuedRequest(request);
        }
    } finally {
        queueRunning = false;
    }
}


async function ensureReverseGeocodingConfig() {
    if (configLoaded) return;
    configLoaded = true;

    try {
        const configUrl = new URL("../reverse_geocoding.json", import.meta.url);
        const response = await fetch(configUrl.toString(), {headers: {Accept: "application/json"}});
        if (!response.ok) return;
        const parsed = await response.json();
        reverseGeocodingConfig = {
            ...defaultReverseGeocodingConfig,
            ...parsed,
        };
    } catch (error) {
        console.warn("Timeline card: reverse geocoding config fallback", error);
    }
}

async function resolveQueuedRequest({key, lat, lon, osmApiKey}) {
    const pending = pendingByKey.get(key);
    if (!pending) return;

    let name = UNKNOWN_LOCATION;
    let result = null;

    try {
        const url = new URL(reverseGeocodingConfig.nominatim_reverse_url);
        url.searchParams.set("format", "json");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lon));
        url.searchParams.set("email", osmApiKey);

        const response = await fetch(url.toString(), {
            headers: {Accept: "application/json"},
        });
        if (response.ok) {
            result = await response.json();
            name = result.display_name || result.name || UNKNOWN_LOCATION;
        }
    } catch (error) {
        console.warn("Timeline card: reverse geocoding failed", error);
    }

    geocodeCache.set(key, {
        status: "ready",
        name,
        result,
    });

    for (const segment of pending.segments) {
        segment.placeName = name;
        segment.reverseGeocoding = result;
    }
    for (const callback of pending.callbacks) {
        callback();
    }

    pendingByKey.delete(key);
}

function cacheUnknown(key) {
    geocodeCache.set(key, {
        status: "ready",
        name: UNKNOWN_LOCATION,
        result: null,
    });
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
    return attrs.formatted_place || attrs.formatted_address || state.state || null;
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

function toCacheKey(center) {
    if (!center) return "unknown";
    return `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
