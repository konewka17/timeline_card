import { startOfDay, endOfDay } from "./utils.js";

export async function fetchHistory(hass, entityId, date) {
  if (!hass || !entityId) return [];
  const start = startOfDay(date);
  const end = endOfDay(date);
  const message = {
    type: "history_during_period",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: false,
    significant_changes_only: false,
  };

  const response = await callWS(hass, message);
  const states = extractEntityStates(response, entityId);
  return states
    .map((state) => toPoint(state))
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lon));
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
  if (!Array.isArray(response)) return [];
  if (response.length === 0) return [];
  if (Array.isArray(response[0])) {
    return response[0] || [];
  }
  return response.filter((state) => state.entity_id === entityId);
}

function toPoint(state) {
  const attrs = state.attributes || {};
  const lat = Number(attrs.latitude);
  const lon = Number(attrs.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    ts: new Date(state.last_changed || state.last_updated || state.created || state.timestamp || Date.now()),
  };
}
