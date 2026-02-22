const UNKNOWN_LOCATION = "Unknown location";
const LOADING_LOCATION = "Loading address...";

const defaultReverseGeocodingConfig = {
    nominatim_reverse_url: "https://nominatim.openstreetmap.org/reverse",
    request_interval_ms: 1000,
};
let reverseGeocodingConfig = defaultReverseGeocodingConfig;
let configLoaded = false;
const queuedRequests = [];
let queuedSegments = new WeakSet();
let queueRunning = false;
let lastRequestAt = 0;
let queueSession = 0;


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

        const placeName = placeIntervals.length
            ? pickPlaceName(placeIntervals, segment.start, segment.end)
            : null;
        if (placeName) {
            segment.placeName = placeName;
            segment.reverseGeocoding = {source: "places", name: placeName};
            continue;
        }

        if (!osmApiKey) {
            segment.placeName = UNKNOWN_LOCATION;
            segment.reverseGeocoding = null;
            continue;
        }

        segment.placeName = LOADING_LOCATION;
        segment.reverseGeocoding = null;
        enqueueReverseLookup(segment, osmApiKey, onUpdate);
    }
}

function enqueueReverseLookup(segment, osmApiKey, onUpdate) {
    if (queuedSegments.has(segment)) return;
    queuedSegments.add(segment);
    queuedRequests.push({segment, osmApiKey, onUpdate, retriesLeft: 3});
    processQueue();
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    const sessionAtStart = queueSession;

    try {
        await ensureReverseGeocodingConfig();
        while (queuedRequests.length && sessionAtStart === queueSession) {
            const waitMs = reverseGeocodingConfig.request_interval_ms - (Date.now() - lastRequestAt);
            if (waitMs > 0) await sleep(waitMs);

            const request = queuedRequests.shift();
            lastRequestAt = Date.now();
            await resolveQueuedRequest(request, sessionAtStart);
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

async function resolveQueuedRequest(request, sessionAtStart) {
    const {segment, osmApiKey, onUpdate, retriesLeft} = request;
    if (sessionAtStart !== queueSession) return;
    let name = UNKNOWN_LOCATION;
    let result = null;

    try {
        const url = new URL(reverseGeocodingConfig.nominatim_reverse_url);
        url.searchParams.set("format", "json");
        url.searchParams.set("lat", String(segment.center.lat));
        url.searchParams.set("lon", String(segment.center.lon));
        url.searchParams.set("email", osmApiKey);

        const response = await fetch(url.toString(), {
            headers: {Accept: "application/json"},
        });

        if (!response.ok) {
            if (retriesLeft > 0) {
                queuedRequests.push({...request, retriesLeft: retriesLeft - 1});
                return;
            }
        } else {
            result = await response.json();
            name = result.display_name || result.name || UNKNOWN_LOCATION;
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
