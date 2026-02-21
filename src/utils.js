import {t} from "./localization.js";

export function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function formatDate(date, localeContext) {
    try {
        return new Intl.DateTimeFormat(localeContext?.language, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(date);
    } catch {
        return date.toDateString();
    }
}

function resolveHour12(timeDisplay) {
    if (timeDisplay === "12h") return true;
    if (timeDisplay === "24h") return false;
    return undefined;
}

export function formatTime(date, localeContext) {
    try {
        return new Intl.DateTimeFormat(localeContext?.language, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: resolveHour12(localeContext?.timeDisplay),
        }).format(date);
    } catch {
        return date.toLocaleTimeString();
    }
}

export function formatTimeRange(start, end, options = {}, localeContext) {
    const hideStartTime = options.hideStartTime || false;
    const hideEndTime = options.hideEndTime || false;

    if (hideStartTime && hideEndTime) {
        return t(localeContext, "allDay");
    } else if (hideStartTime && !hideEndTime) {
        return formatTime(end, localeContext);
    } else if (hideEndTime && !hideStartTime) {
        return formatTime(start, localeContext);
    } else {
        return `${formatTime(start, localeContext)} - ${formatTime(end, localeContext)}`;
    }
}

export function formatDuration(ms, localeContext) {
    const totalMinutes = ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours} ${t(localeContext, "hourShort")} ${minutes} ${t(localeContext, "minuteShort")}`;
    }
    return `${minutes} ${t(localeContext, "minuteShort")}`;
}

export function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "0 m";
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

export function haversineMeters(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const r = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sin1 = Math.sin(dLat / 2);
    const sin2 = Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2), Math.sqrt(1 - (sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2)));
    return r * c;
}

export function toLatLon(point) {
    return {lat: point.point[0], lon: point.point[1]}
}
