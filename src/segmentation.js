import {haversineMeters} from "./utils.js";

export function segmentTimeline(points, options, zones) {
    if (!Array.isArray(points) || points.length === 0) return [];
    const stayRadius = Math.max(10, options.stayRadiusM || 75);
    const minStayMs = Math.max(1, options.minStayMinutes || 10) * 60000;

    const sorted = [...points].sort((a, b) => a.ts - b.ts);
    const stays = detectStays(sorted, stayRadius, minStayMs);

    const segments = [];
    let cursor = 0;
    stays.forEach((stay) => {
        if (cursor < stay.startIndex) {
            const move = buildMoveSegment(sorted.slice(cursor, stay.startIndex + 1));
            if (move) segments.push(move);
        }
        segments.push(buildStaySegment(stay, zones));
        cursor = stay.endIndex + 1;
    });

    if (cursor < sorted.length) {
        const move = buildMoveSegment(sorted.slice(cursor));
        if (move) segments.push(move);
    }

    return segments;
}

function detectStays(points, stayRadius, minStayMs) {
    const stays = [];
    let i = 0;

    while (i < points.length - 1) {
        const cluster = [points[i]];
        let center = {lat: points[i].lat, lon: points[i].lon};
        let lastInIndex = i;
        let outlierUsed = false;

        for (let j = i + 1; j < points.length; j += 1) {
            const distance = haversineMeters(center, points[j]);
            if (distance <= stayRadius) {
                cluster.push(points[j]);
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

        const duration = points[lastInIndex].ts - points[i].ts;
        if (duration >= minStayMs) {
            const radius = maxDistance(center, cluster);
            stays.push({
                startIndex: i,
                endIndex: lastInIndex,
                start: points[i].ts,
                end: points[lastInIndex].ts,
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
        {lat: 0, lon: 0}
    );
    return {
        lat: sum.lat / cluster.length,
        lon: sum.lon / cluster.length,
    };
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

function buildMoveSegment(points) {
    if (!points || points.length < 2) return null;
    let distance = 0;
    for (let i = 1; i < points.length; i += 1) {
        distance += haversineMeters(points[i - 1], points[i]);
    }
    const start = points[0].ts;
    const end = points[points.length - 1].ts;
    return {
        type: "move",
        start,
        end,
        durationMs: end - start,
        distanceM: distance,
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
