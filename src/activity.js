import {haversineMeters, toLatLon} from "./utils.js";

export function resolveActivities(segments, activityStates, date, activityIconMap, zones) {
    if (!activityStates || activityStates.length === 0) return segments;
    const intervals = buildActivityIntervals(activityStates, date);

    return segments.flatMap((segment) => {
        if (segment.type !== "move") {
            return [segment];
        }

        let totalPoints = segment.points?.length || 0;
        if (totalPoints < 2) {
            return [segment];
        }

        // Group points by activity
        const activityGroups = [];
        let currentGroup = null;

        for (let pIndex = 0; pIndex < segment.points.length; pIndex++) {
            const point = segment.points[pIndex];
            // Let's ensure it's comparable:
            const t = point.timestamp instanceof Date ? point.timestamp.getTime() : new Date(point.timestamp).getTime();

            // Find activity for this point
            let bestActivity = "unknown";
            for (let j = intervals.length - 1; j >= 0; j--) {
                if (t >= intervals[j].start) {
                    bestActivity = intervals[j].name;
                    break;
                }
            }

            if (!currentGroup || currentGroup.name !== bestActivity) {
                // Start new group
                if (currentGroup) {
                    currentGroup.endIndex = pIndex; // Shared point
                    activityGroups.push(currentGroup);
                }
                currentGroup = {
                    name: bestActivity,
                    startIndex: pIndex, // Share boundary point
                };
            }
        }

        if (currentGroup) {
            currentGroup.endIndex = segment.points.length - 1;
            activityGroups.push(currentGroup);
        }

        // Rebuild full segments from each group
        const splitSegments = [];
        for (const group of activityGroups) {
            const groupPoints = segment.points.slice(group.startIndex, group.endIndex + 1);
            if (groupPoints.length < 2) continue;

            let distance = 0;
            for (let k = 1; k < groupPoints.length; k++) {
                distance += haversineMeters(toLatLon(groupPoints[k - 1]), toLatLon(groupPoints[k]));
            }

            const start = groupPoints[0].timestamp;
            const end = groupPoints[groupPoints.length - 1].timestamp;

            const newSegment = {
                type: "move",
                start,
                end,
                durationMs: end - start,
                distanceM: distance,
                points: groupPoints,
            };

            const actName = group.name && group.name !== "unknown" ? group.name : null;
            if (actName) {
                newSegment.activityName = actName;
                newSegment.activityIcon =
                    activityIconMap[actName] ??
                    zones.find(
                        (zone) =>
                            zone.id === actName.toLowerCase() || zone.name.toLowerCase() === actName.toLowerCase(),
                    )?.icon;
            }

            if (newSegment.durationMs > 0 || newSegment.distanceM > 0) {
                splitSegments.push(newSegment);
            }
        }

        return splitSegments.length > 0 ? splitSegments : [segment];
    });
}

function buildActivityIntervals(activityStates, date) {
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    return activityStates.map((state, index) => {
        const next = activityStates[index + 1];
        const end = next ? new Date(next.lu * 1000) : endOfDay;
        let name = state.s;
        return {
            start: new Date(state.lu * 1000),
            end,
            name,
        };
    });
}

function pickActivityName(intervals, start, end) {
    const counts = new Map();
    for (const interval of intervals) {
        const overlapMs = Math.min(end, interval.end) - Math.max(start, interval.start);
        if (overlapMs <= 0 || !interval.name || interval.name === "unknown") continue;
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
