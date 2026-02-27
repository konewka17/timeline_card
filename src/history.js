import {endOfDay, startOfDay} from "./utils.js";

export async function fetchEntityHistory(hass, entityId, date) {
    if (!hass || !entityId) return [];
    const start = startOfDay(date);
    const end = endOfDay(date);
    const message = {
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: [entityId],
        minimal_response: false,
        no_attributes: false,
        significant_changes_only: false,
    };

    const response = await hass.callWS(message);
    return response[entityId] || [];
}

export function toPoint(state) {
    const attrs = state.a || {};
    let lat = Number(attrs.latitude);
    let lon = Number(attrs.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {point: [lat, lon], timestamp: new Date(state.lu * 1000),};
}
