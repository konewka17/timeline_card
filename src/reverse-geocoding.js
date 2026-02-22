export function applyPlacesToStays(segments, placeStates, date) {
    if (!placeStates.length) return segments;
    const sortedPlaces = [...placeStates].sort((a, b) => a.ts - b.ts);
    const placeIntervals = buildPlaceIntervals(sortedPlaces, date);

    return segments.map((segment) => {
        if (segment.type !== "stay") return segment;
        if (segment.zoneName) return segment;
        const name = pickPlaceName(placeIntervals, segment.start, segment.end);
        if (!name) return segment;
        return {...segment, placeName: name};
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
        if (overlapMs <= 0) continue;
        if (!interval.name) continue;
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