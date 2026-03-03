import {formatTime as formatTimeHelper} from "custom-card-helpers";

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

export function formatDate(date) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(date);
    } catch {
        return date.toDateString();
    }
}

export function formatTime(date, locale) {
    return formatTimeHelper(date, locale);
    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    } catch {
        return date.toLocaleTimeString();
    }
}

export function formatTimeRange(start, end, options = {}) {
    const hideStartTime = options.hideStartTime || false;
    const hideEndTime = options.hideEndTime || false;
    const locale = options.locale || {language: "en", time_format: "language"};

    if (hideStartTime && hideEndTime) {
        return "all day";
    } else if (hideStartTime && !hideEndTime) {
        return formatTime(end, locale);
    } else if (hideEndTime && !hideStartTime) {
        return formatTime(start, locale);
    } else {
        return `${formatTime(start, locale)} - ${formatTime(end, locale)}`;
    }
}

export function formatDuration(ms) {
    const totalMinutes = ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
}

export function formatDistance(meters, distanceUnit = "metric") {
    if (!Number.isFinite(meters)) return "0 m";

    if (distanceUnit === "imperial") {
        const feet = meters * 3.28084;
        if (feet >= 5280) {
            return `${(feet / 5280).toFixed(1)} mi`;
        }
        return `${Math.round(feet)} ft`;
    }

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
    const c =
        2 *
        Math.atan2(
            Math.sqrt(sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2),
            Math.sqrt(1 - (sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2)),
        );
    return r * c;
}

export function toLatLon(point) {
    return {lat: point.point[0], lon: point.point[1]};
}

export function getTrackColor(index, colors = []) {
    if (colors.length) {
        return colors[index % colors.length];
    }

    if (index === 0) {
        return "var(--primary-color)";
    }
    return `var(--color-${((index + 1) % 12) + 1})`;
}

export function capitalizeFirst(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
}
