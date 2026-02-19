import css from "./card.css";
import { fetchHistory, fetchEntityHistory } from "./history.js";
import { segmentTimeline } from "./segmentation.js";
import { renderTimeline } from "./timeline.js";
import { formatDate, startOfDay, toDateKey } from "./utils.js";
import "./editor.js";

const DEFAULT_CONFIG = {
  entity: null,
  places_entity: null,
  stay_radius_m: 75,
  min_stay_minutes: 10,
  show_debug: false,
};

class TimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULT_CONFIG };
    this._cache = new Map();
    this._selectedDate = startOfDay(new Date());
    this._hass = null;
    this._loading = false;
    this._error = null;
    this._rendered = false;

    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "prev") {
        this._shiftDate(-1);
      } else if (action === "next") {
        this._shiftDate(1);
      } else if (action === "refresh") {
        this._refreshCurrentDay();
      }
    });
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("You need to define an entity");
    }
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._cache.clear();
    this._selectedDate = startOfDay(new Date());
    if (this._hass) {
      this._ensureDay(this._selectedDate);
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._mapCard) {
      this._mapCard.hass = hass;
    }
    if (!this._config.entity) return;
    const dateKey = toDateKey(this._selectedDate);
    if (!this._cache.has(dateKey)) {
      this._ensureDay(this._selectedDate);
    }
    if (!this._rendered) {
      this._render();
      this._rendered = true;
    }
  }

  getCardSize() {
    return 6;
  }

  _shiftDate(direction) {
    const next = new Date(this._selectedDate);
    next.setDate(next.getDate() + direction);
    this._selectedDate = startOfDay(next);
    this._ensureDay(this._selectedDate);
    this._render();
  }

  _refreshCurrentDay() {
    const key = toDateKey(this._selectedDate);
    this._cache.delete(key);
    this._ensureDay(this._selectedDate);
    this._render();
  }

  async _ensureDay(date) {
    const key = toDateKey(date);
    const existing = this._cache.get(key);
    if (existing && (existing.segments || existing.loading)) return;

    this._cache.set(key, { loading: true, segments: null, error: null, debug: null });
    this._render();

    try {
      const points = await fetchHistory(this._hass, this._config.entity, date);
      const placeStates = this._config.places_entity
        ? await fetchEntityHistory(this._hass, this._config.places_entity, date)
        : [];
      const zones = this._collectZones();
      let segments = segmentTimeline(points, {
        stayRadiusM: this._config.stay_radius_m,
        minStayMinutes: this._config.min_stay_minutes,
      }, zones);
      if (placeStates.length) {
        segments = applyPlacesToStays(segments, placeStates, date);
      }
      const debug = {
        points: points.length,
        zones: zones.length,
        places: placeStates.length,
        first: points[0]?.ts || null,
        last: points[points.length - 1]?.ts || null,
      };
      this._cache.set(key, { loading: false, segments, error: null, debug });
    } catch (err) {
      console.warn("Timeline card: history fetch failed", err);
      this._cache.set(key, {
        loading: false,
        segments: null,
        error: this._formatErrorMessage(err),
        debug: null,
      });
    }
    this._render();
  }

  _collectZones() {
    if (!this._hass || !this._hass.states) return [];
    return Object.values(this._hass.states)
      .filter((state) => state.entity_id && state.entity_id.startsWith("zone."))
      .map((state) => ({
        name: state.attributes?.friendly_name || state.entity_id,
        icon: state.attributes?.icon || null,
        lat: Number(state.attributes?.latitude),
        lon: Number(state.attributes?.longitude),
        radius: Number(state.attributes?.radius) || 100,
      }))
      .filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lon));
  }

  _render() {
    if (!this.shadowRoot) return;
    const dateKey = toDateKey(this._selectedDate);
    const dayData = this._cache.get(dateKey) || { loading: false, segments: null, error: null, debug: null };
    const isFuture = this._selectedDate >= startOfDay(new Date());

    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      <ha-card>
        <div class="card">
          <div class="header my-header">
            <ha-icon-button class="nav-button" data-action="prev" label="Previous day"><ha-icon icon="mdi:chevron-left"></ha-icon></ha-icon-button>
            <div class="date">${formatDate(this._selectedDate)}</div>
            <div class="header-actions">
              <ha-icon-button class="nav-button" data-action="refresh" label="Refresh"><ha-icon icon="mdi:refresh"></ha-icon></ha-icon-button>
              <ha-icon-button class="nav-button" data-action="next" label="Next day" ${isFuture ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></ha-icon-button>
            </div>
          </div>
          <div class="body">
            <div id="overview-map"></div>
            ${dayData.error ? `<div class="error">${dayData.error}</div>` : ""}
            ${dayData.loading ? `<div class="loading">Loading timeline...</div>` : ""}
            ${!dayData.loading && !dayData.error ? renderTimeline(dayData.segments) : ""}
            ${this._config.show_debug ? this._renderDebug(dayData) : ""}
          </div>
        </div>
      </ha-card>
    `;
    this._attachMapCard();
  }

  async _attachMapCard() {
    await this._createMapCard();

    const container = this.shadowRoot.getElementById("overview-map");
    if (!container) return;

    if (!container.contains(this._mapCard)) {
      container.innerHTML = "";
      container.appendChild(this._mapCard);
    }
  }

  async _createMapCard() {
    if (this._mapCard) return;

    const helpers = await window.loadCardHelpers();

    this._mapCard = await helpers.createCardElement({
      type: "map",
      entities: ["person.tom"],
      hours_to_show: 24,
    });

    if (this._hass) {
      this._mapCard.hass = this._hass;
    }
  }

  _renderDebug(dayData) {
    const debug = dayData.debug;
    if (!debug) return `<div class="debug">Debug: no data</div>`;
    const first = debug.first ? new Date(debug.first).toLocaleString() : "n/a";
    const last = debug.last ? new Date(debug.last).toLocaleString() : "n/a";
    return `
      <div class="debug">
        Debug: points=${debug.points}, zones=${debug.zones}, places=${debug.places ?? 0}, first=${first}, last=${last}
      </div>
    `;
  }

  _formatErrorMessage(err) {
    const message = err && err.message ? String(err.message) : "";
    if (message.toLowerCase().includes("unknown command")) {
      return "History WebSocket API not available. Ensure the Recorder/History integration is enabled.";
    }
    return message || "Unable to load history";
  }
}

function applyPlacesToStays(segments, placeStates, date) {
  if (!placeStates.length) return segments;
  const sortedPlaces = [...placeStates].sort((a, b) => a.ts - b.ts);
  const placeIntervals = buildPlaceIntervals(sortedPlaces, date);

  return segments.map((segment) => {
    if (segment.type !== "stay") return segment;
    if (segment.zoneName) return segment;
    const name = pickPlaceName(placeIntervals, segment.start, segment.end);
    if (!name) return segment;
    return { ...segment, placeName: name };
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

customElements.define("timeline-card", TimelineCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "timeline-card",
  name: "Timeline Card",
  description: "Daily location timeline from GPS history.",
});

export function getConfigElement() {
  return document.createElement("timeline-card-editor");
}

export function getStubConfig() {
  return {
    entity: "device_tracker.your_device",
    places_entity: null,
    stay_radius_m: 75,
    min_stay_minutes: 10,
    show_debug: false,
  };
}
