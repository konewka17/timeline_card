import {endOfDay, haversineMeters, startOfDay, toLatLon, toPoint} from "./utils.js";
import {resolveStaySegments} from "./reverse-geocoding.js";
import {resolveActivities} from "./activity.js";

export function segmentTimeline(points, config, zones) {
    if (!Array.isArray(points) || points.length === 0) return [];
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const stays = detectStays(sorted, config);

    const segments = [];
    let cursor = 0;
    let lastStayEndpoint = null;

    stays.forEach((stay) => {
        if (cursor < stay.startIndex) {
            const move = buildMoveSegment(sorted.slice(cursor, stay.startIndex + 1), lastStayEndpoint);
            if (move) segments.push(move);
        }
        segments.push(buildStaySegment(stay, zones));
        cursor = stay.endIndex + 1;
        lastStayEndpoint = sorted[stay.endIndex];
    });

    if (cursor < sorted.length) {
        const move = buildMoveSegment(sorted.slice(cursor), lastStayEndpoint);
        if (move) segments.push(move);
    }
    return segments;
}

function detectStays(points, config) {
    const stayRadius = Math.max(10, config.stay_radius_m || 75);
    const minStayMs = Math.max(1, config.min_stay_minutes || 10) * 60000;

    const stays = [];
    let i = 0;
    while (i < points.length - 1) {
        const cluster = [toLatLon(points[i])];
        let center = toLatLon(points[i]);
        let lastInIndex = i;
        let outlierUsed = false;

        for (let j = i + 1; j < points.length; j += 1) {
            const candidate = toLatLon(points[j]);
            const distance = haversineMeters(center, candidate);
            if (distance <= stayRadius) {
                cluster.push(candidate);
                center = meanCenter(cluster);
                lastInIndex = j;
                outlierUsed = false;
                continue;
            }
            if (!outlierUsed && distance <= stayRadius * 2) {
                outlierUsed = true;
                continue;
            }
            break;
        }

        const duration = points[lastInIndex].timestamp - points[i].timestamp;
        if (duration >= minStayMs) {
            const radius = maxDistance(center, cluster);
            const nextPoint = points[lastInIndex + 1];
            stays.push({
                startIndex: i,
                endIndex: lastInIndex,
                start: points[i].timestamp,
                end: nextPoint ? nextPoint.timestamp : points[lastInIndex].timestamp,
                center,
                radius,
            });
            i = lastInIndex + 1;
        } else {
            i += 1;
        }
    }
    return stays;
}

function meanCenter(cluster) {
    const sum = cluster.reduce(
        (acc, point) => {
            acc.lat += point.lat;
            acc.lon += point.lon;
            return acc;
        },
        {lat: 0, lon: 0},
    );
    return {lat: sum.lat / cluster.length, lon: sum.lon / cluster.length};
}

function maxDistance(center, cluster) {
    let max = 0;
    for (const point of cluster) {
        const distance = haversineMeters(center, point);
        if (distance > max) max = distance;
    }
    return max;
}

function buildStaySegment(stay, zones) {
    const zone = resolveZone(stay.center, zones);
    return {
        type: "stay",
        start: stay.start,
        end: stay.end,
        durationMs: stay.end - stay.start,
        center: stay.center,
        radius: stay.radius,
        zoneName: zone ? zone.name : null,
        zoneIcon: zone ? zone.icon : null,
    };
}

function buildMoveSegment(points, startPoint = null) {
    if (!points || points.length < 2) return null;
    let distance = 0;
    if (startPoint) distance += haversineMeters(toLatLon(startPoint), toLatLon(points[0]));
    for (let i = 1; i < points.length; i += 1) {
        distance += haversineMeters(toLatLon(points[i - 1]), toLatLon(points[i]));
    }
    const start = points[0].timestamp;
    const end = points[points.length - 1].timestamp;
    return {
        type: "move",
        start,
        end,
        durationMs: end - start,
        distanceM: distance,
        points: startPoint ? [startPoint, ...points] : points,
    };
}

function resolveZone(center, zones) {
    if (!Array.isArray(zones)) return null;
    let match = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
        const distance = haversineMeters(center, zone);
        if (distance <= zone.radius && distance < bestDistance) {
            match = zone;
            bestDistance = distance;
        }
    }
    return match;
}

function collectZones(hass) {
    if (!hass || !hass.states) return [];
    const states = Object.values(hass.states);
    return states
        .filter((state) => state.entity_id?.startsWith("zone.") && state.attributes?.passive !== true)
        .map((state) => ({
            id: state.entity_id.replace("zone.", ""),
            name: state.attributes?.friendly_name || state.entity_id,
            icon: state.attributes?.icon || null,
            lat: Number(state.attributes?.latitude),
            lon: Number(state.attributes?.longitude),
            radius: Number(state.attributes?.radius) || 100,
        }))
        .filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lon));
}

async function fetchEntityHistory(hass, entityId, date) {
    if (!hass || !entityId) return [];
    const historyPadding = 6 * 60 * 60 * 1000;
    const message = {
        type: "history/history_during_period",
        start_time: new Date(startOfDay(date) - historyPadding).toISOString(),
        end_time: new Date(endOfDay(date) + historyPadding).toISOString(),
        entity_ids: [entityId],
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false,
    };

    const response = await callWS(hass, message);
    const states = extractEntityStates(response, entityId);
    return clampHistoryToDay(states, date);
}

function clampHistoryToDay(states, date) {
    const start = startOfDay(date);
    const end = endOfDay(date);

    const currentDayStates = [];
    let previousState = null;
    let previousTimestamp = null;
    let nextState = null;
    let nextTimestamp = null;

    for (const state of states) {
        const timestamp = state.lu * 1000;
        if (timestamp < start) {
            if (previousTimestamp === null || timestamp > previousTimestamp) {
                previousState = state;
                previousTimestamp = timestamp;
            }
        } else if (timestamp > end) {
            if (nextTimestamp === null || timestamp < nextTimestamp) {
                nextState = state;
                nextTimestamp = timestamp;
            }
        } else {
            currentDayStates.push(state);
        }
    }

    if (previousState) {
        currentDayStates.unshift({...previousState, lu: start / 1000, lc: start / 1000,});
    }
    if (nextState) {
        currentDayStates.push({...nextState, lu: end / 1000, lc: end / 1000,});
    }
    return currentDayStates;
}

async function callWS(hass, message) {
    if (typeof hass.callWS === "function") {
        return hass.callWS(message);
    }
    if (hass.connection && typeof hass.connection.sendMessagePromise === "function") {
        return hass.connection.sendMessagePromise(message);
    }
    throw new Error("Home Assistant connection not available");
}

function extractEntityStates(response, entityId) {
    if (!response) return [];
    if (!Array.isArray(response) && typeof response === "object") {
        const list = response[entityId];
        return Array.isArray(list) ? list : [];
    }
    if (!Array.isArray(response)) return [];
    if (response.length === 0) return [];
    if (Array.isArray(response[0])) {
        return response[0] || [];
    }
    return response.filter((state) => state.entity_id === entityId);
}

export async function getSegmentedTracks(date, config, hass, onQueueUpdate) {
    const entityEntries = config.entity;
    const zones = collectZones(hass);

    return await Promise.all(
        entityEntries.map(async (entry) => {
            const entityId = entry.entity;
            const rawStates = await fetchEntityHistory(hass, entityId, date);
            const points = rawStates.map((state) => toPoint(state)).filter(Boolean);

            const placeEntityId = entry.places_entity || null;
            const placeStates = placeEntityId ? await fetchEntityHistory(hass, placeEntityId, date) : [];

            const activityEntityId = entry.activity_entity || null;
            const activityStates = activityEntityId ? await fetchEntityHistory(hass, activityEntityId, date) : [];

            const baseSegments = segmentTimeline(points, config, zones);
            resolveStaySegments(baseSegments, placeStates, date, config.osm_api_key, onQueueUpdate);
            const segments = resolveActivities(baseSegments, activityStates, date, config.activity_icon_map, zones);
            return {entityId, placeEntityId, activityEntityId, points, segments};
        }),
    );
}
