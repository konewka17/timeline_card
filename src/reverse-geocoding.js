import {sleep} from "./utils.js";

const UNKNOWN_LOCATION = "Unknown location";
const LOADING_LOCATION = "Loading address...";
const PERSISTENT_CACHE_KEY = "location_timeline_reverse_geocode_cache_v1";
const MAX_PERSISTENT_CACHE_ENTRIES = 300;

// Attributes that only Places v2 puts on the main sensor. Places v3 moved all of them
// to child sensors, leaving the main sensor with just coordinates.
const V2_ADDRESS_ATTRIBUTES = ["place_name", "street", "street_number", "city", "formatted_address", "formatted_place", "devicetracker_entityid"];

// A single display-option field rendered raw by Places: an OSM token (`not_home`, `house`,
// `secondary`, `charging_station`) or a bare house number (`13`, `2a`).
const RAW_OPTION_TOKEN = /^([a-z][a-z0-9]*(_[a-z0-9]+)*|\d+[a-z]?)$/;

// Places appends this when its `show_time` option is on, swapping the time for a date
// once the state is over a day old. Both forms are plain f-strings in the integration,
// never translated, so matching `since` literally is safe. Same pattern as Places' own
// `helpers.clear_since_from_state`; the `[:/]` class is what covers the date form.
const SINCE_SUFFIX = /\s*\(since \d\d[:/]\d\d\)$/;

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

export function resolveStaySegments(segments, placeStates, placeNameStates, date, osmApiKey, onUpdate) {
    // Intervals from the Places v3 place_name child sensor take precedence: the main
    // sensor's state only holds the (less clean) display-options string in v3.
    const placeNameIntervals = buildIntervals(placeNameStates, date, placeNameSensorDisplayName);
    const placeIntervals = buildIntervals(placeStates, date, placeDisplayName);
    for (const segment of segments) {
        if (segment.type !== "stay" || segment.zoneName) continue;
        if (segment.placeName && segment.placeName !== LOADING_LOCATION) continue;

        // Load from persistent cache
        const segmentKey = toPersistentCacheKey(segment);
        const cached = persistentCache.get(segmentKey);
        if (cached && cached.placeName) {
            if (cached.placeName === UNKNOWN_LOCATION) {
                persistentCache.delete(segmentKey);
            } else {
                segment.placeName = cached.placeName;
                segment.reverseGeocoding = {...cached.reverseGeocoding, loadedFromPersistentCache: true};
                continue;
            }
        }

        // Load from `places`
        const placeName = pickPlaceName(placeNameIntervals, segment.start, segment.end)
            || pickPlaceName(placeIntervals, segment.start, segment.end);
        if (placeName) {
            segment.placeName = placeName;
            segment.reverseGeocoding = {source: "places", name: placeName, intervals: [...placeNameIntervals, ...placeIntervals]};
            setPersistentCache(segmentKey, segment.placeName, segment.reverseGeocoding);
            continue;
        }

        // Load from OSM Nominatim API
        if (osmApiKey) {
            segment.placeName = LOADING_LOCATION;
            segment.reverseGeocoding = null;
            enqueueReverseLookup(segment, segmentKey, osmApiKey, onUpdate);
            continue;
        }

        segment.placeName = UNKNOWN_LOCATION;
        segment.reverseGeocoding = null;
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
            const formatted_address = features.street ? `${features.street}${houseNumber}, ${features.city}` : null;
            const formatted_locality = features.locality ? `${features.locality}, ${features.city}` : null;
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
    if (name !== UNKNOWN_LOCATION) {
        setPersistentCache(segmentKey, segment.placeName, segment.reverseGeocoding);
    }
    onUpdate();
}

function buildIntervals(states, date, displayNameFn) {
    if (!Array.isArray(states) || states.length === 0) return [];
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    return states.map((state, index) => {
        const next = states[index + 1];
        const end = next ? new Date(next.lu * 1000) : endOfDay;
        const name = displayNameFn(state);
        return {
            start: new Date(state.lu * 1000),
            end,
            name,
        };
    });
}

function placeDisplayName(state) {
    const attrs = state.a || {};
    // Stripped up front so both branches are free of it: `show_time` is a Places option,
    // not a v3 one, so a v2 sensor falling through to its state carries the suffix too.
    const sensorState = stripSinceSuffix(state.s);

    if (V2_ADDRESS_ATTRIBUTES.some((key) => attrs[key])) {
        const streetAddress = [attrs.street, attrs.street_number].filter(Boolean).join(" ");
        const formatted_address = streetAddress ? [streetAddress, attrs.city].filter(Boolean).join(", ") : null;
        return attrs.place_name || formatted_address || sensorState || attrs.formatted_address || null;
    }

    // Places v3: no address attributes left, so the state is whatever the user's display
    // options render. With `formatted_place` that is a readable name, but a plain field
    // list yields raw OSM tokens ("not_home, house, 13, Beatrixstraat"), which must not be
    // shown as an address — fall through to the place_name sensor or reverse geocoding.
    return cleanDisplayOptionsState(sensorState);
}

function stripSinceSuffix(value) {
    if (typeof value !== "string") return value;
    return value.trim().replace(SINCE_SUFFIX, "");
}

function cleanDisplayOptionsState(value) {
    const text = normalizeSensorState(value);
    if (!text || looksLikeRawDisplayOptions(text)) return null;
    return text.split(",").map((part) => part.trim()).filter(Boolean).join(", ");
}

function looksLikeRawDisplayOptions(name) {
    const parts = String(name).split(",").map((part) => part.trim()).filter(Boolean);
    return !parts.length || parts.some((part) => RAW_OPTION_TOKEN.test(part));
}

function placeNameSensorDisplayName(state) {
    return normalizeSensorState(state.s);
}

function normalizeSensorState(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text === "unknown" || text === "unavailable" || text === "none") return null;
    return text;
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
        // Drop entries cached before raw Places v3 display-options strings were rejected,
        // otherwise those names keep being served from the cache forever.
        return new Map(parsed.filter(([, value]) => !looksLikeRawDisplayOptions(value?.placeName || "")));
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

export function clearPersistentCache() {
    localStorage.removeItem(PERSISTENT_CACHE_KEY);
}
