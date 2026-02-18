import "./card.css";
import { fetchHistory } from "./history.js";
import { segmentTimeline } from "./segmentation.js";
import { renderTimeline } from "./timeline.js";
import { formatDate, startOfDay, toDateKey } from "./utils.js";
import "./editor.js";

const DEFAULT_CONFIG = {
  entity: null,
  stay_radius_m: 75,
  min_stay_minutes: 10,
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

    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "prev") {
        this._shiftDate(-1);
      } else if (action === "next") {
        this._shiftDate(1);
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
    if (this._config.entity) {
      this._ensureDay(this._selectedDate);
    }
    this._render();
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

  async _ensureDay(date) {
    const key = toDateKey(date);
    const existing = this._cache.get(key);
    if (existing && (existing.segments || existing.loading)) return;

    this._cache.set(key, { loading: true, segments: null, error: null });
    this._render();

    try {
      const points = await fetchHistory(this._hass, this._config.entity, date);
      const zones = this._collectZones();
      const segments = segmentTimeline(points, {
        stayRadiusM: this._config.stay_radius_m,
        minStayMinutes: this._config.min_stay_minutes,
      }, zones);
      this._cache.set(key, { loading: false, segments, error: null });
    } catch (err) {
      this._cache.set(key, {
        loading: false,
        segments: null,
        error: err && err.message ? err.message : "Unable to load history",
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
        lat: Number(state.attributes?.latitude),
        lon: Number(state.attributes?.longitude),
        radius: Number(state.attributes?.radius) || 100,
      }))
      .filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lon));
  }

  _render() {
    if (!this.shadowRoot) return;
    const dateKey = toDateKey(this._selectedDate);
    const dayData = this._cache.get(dateKey) || { loading: false, segments: null, error: null };
    const isFuture = this._selectedDate > startOfDay(new Date());

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="card">
          <div class="header">
            <ha-icon-button class="nav-button" data-action="prev" label="Previous day" icon="mdi:chevron-left"></ha-icon-button>
            <div class="date">${formatDate(this._selectedDate)}</div>
            <ha-icon-button class="nav-button" data-action="next" label="Next day" icon="mdi:chevron-right" ${isFuture ? "disabled" : ""}></ha-icon-button>
          </div>
          <div class="body">
            ${dayData.error ? `<div class="error">${dayData.error}</div>` : ""}
            ${dayData.loading ? `<div class="loading">Loading timeline...</div>` : ""}
            ${!dayData.loading && !dayData.error ? renderTimeline(dayData.segments) : ""}
          </div>
        </div>
      </ha-card>
    `;
  }
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
    stay_radius_m: 75,
    min_stay_minutes: 10,
  };
}
