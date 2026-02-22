import css from "./card.css";
import leafletCss from "leaflet/dist/leaflet.css";
import {fetchEntityHistory, fetchHistory} from "./history.js";
import {segmentTimeline} from "./segmentation.js";
import {renderTimeline} from "./timeline.js";
import {formatDate, startOfDay, toDateKey, toLatLon} from "./utils.js";
import {TimelineLeafletMap} from "./leaflet-map.js";
import {resolveStaySegments} from "./reverse-geocoding.js";

const DEFAULT_CONFIG = {
    entity: null,
    places_entity: null,
    osm_api_key: null,
    stay_radius_m: 75,
    min_stay_minutes: 10,
};

class TimelineCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: "open"});
        this._config = {...DEFAULT_CONFIG};
        this._cache = new Map();
        this._selectedDate = startOfDay(new Date());
        this._hass = null;
        this._rendered = false;
        this._touchStart = null;

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
            } else if (action === "open-date-picker") {
                this._openDatePicker();
            } else if (action === "reset-map-zoom") {
                this._resetMapZoom();
            }
        });


        this.shadowRoot.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.id !== "timeline-date-picker") return;
            if (!target.value) return;
            const next = new Date(`${target.value}T00:00:00`);
            if (!Number.isNaN(next.getTime())) {
                this._selectedDate = startOfDay(next);
                this._ensureDay(this._selectedDate).then(() => this._render());
            }
        });

        this.shadowRoot.addEventListener("mouseover", (event) => {
            const entry = event.target.closest("[data-segment-index]");
            if (!entry || !this.shadowRoot.contains(entry)) return;
            if (entry.contains(event.relatedTarget)) return;
            this._handleSegmentHoverStart(Number(entry.dataset.segmentIndex));
        });

        this.shadowRoot.addEventListener("mouseout", (event) => {
            const entry = event.target.closest("[data-segment-index]");
            if (!entry || !this.shadowRoot.contains(entry)) return;
            if (entry.contains(event.relatedTarget)) return;
            this._clearHoverHighlight();
        });

        this.shadowRoot.addEventListener("click", (event) => {
            const entry = event.target.closest("[data-segment-index]");
            if (!entry || !this.shadowRoot.contains(entry)) return;
            if (entry.contains(event.relatedTarget)) return;
            this._handleSegmentClick(Number(entry.dataset.segmentIndex));
        });
    }

    setConfig(config) {
        if (!config || !config.entity) {
            throw new Error("You need to define an entity");
        }
        this._config = {...DEFAULT_CONFIG, ...config};
        this._cache.clear();
        this._selectedDate = startOfDay(new Date());
        if (this._hass) {
            this._ensureDay(this._selectedDate);
        }
        this._render();
    }

    set hass(hass) {
        this._hass = hass;
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

    static getConfigForm() {
        return {
            schema: [
                {name: "entity", required: true, selector: {entity: {}}},
                {name: "places_entity", selector: {entity: {filter: [{domain: "sensor"}]}}},
                {name: "osm_api_key", selector: {text: {type: "email"}}},
                {name: "stay_radius_m", selector: {number: {min: 1, step: 1, mode: "box"}}},
                {name: "min_stay_minutes", selector: {number: {min: 1, step: 1, mode: "box"}}},
            ],
            computeLabel: (schema) => {
                if (schema.name === "entity") return "Tracked entity";
                if (schema.name === "places_entity") return "Places entity (optional)";
                if (schema.name === "osm_api_key") return "OSM API key (email, optional)";
                if (schema.name === "stay_radius_m") return "Stay radius (m)";
                if (schema.name === "min_stay_minutes") return "Minimum stay (minutes)";
                return undefined;
            },
        };
    }

    static getStubConfig() {
        return {
            entity: "device_tracker.your_device",
            places_entity: null,
            osm_api_key: null,
            stay_radius_m: 75,
            min_stay_minutes: 10,
        };
    }

    getCardSize() {
        return 6;
    }

    _shiftDate(direction) {
        const today = startOfDay(new Date());
        if (direction > 0 && this._selectedDate >= today) {
            return;
        }

        const next = new Date(this._selectedDate);
        next.setDate(next.getDate() + direction);
        this._selectedDate = startOfDay(next);
        this._ensureDay(this._selectedDate).then(() => this._render());
    }

    _resetMapZoom() {
        this._mapView?.resetMapZoom();
        this._updateMapResetButton();
    }

    _refreshCurrentDay() {
        const key = toDateKey(this._selectedDate);
        this._cache.delete(key);
        this._ensureDay(this._selectedDate).then(() => this._render());
    }

    async _ensureDay(date) {
        const key = toDateKey(date);
        const existing = this._cache.get(key);
        if (existing && (existing.segments || existing.loading)) return;

        this._cache.set(key, {loading: true, segments: null, points: null, error: null});

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
            resolveStaySegments(segments, {
                placeStates,
                date,
                osmApiKey: this._config.osm_api_key,
                lookupCachedResult: (stayKey) => this._findCachedStayReverseGeocode(stayKey),
                onUpdate: () => {
                    const day = this._cache.get(key);
                    if (!day || !day.segments) return;
                    this._render();
                },
            });
            this._cache.set(key, {loading: false, segments, points, error: null});
        } catch (err) {
            console.warn("Timeline card: history fetch failed", err);
            this._cache.set(key, {
                loading: false, segments: null, points: null, error: this._formatErrorMessage(err),
            });
        }
        this._render();
        requestAnimationFrame(() => {
            this._refreshMapPaths();
        });
    }


    _findCachedStayReverseGeocode(stayKey) {
        for (const dayData of this._cache.values()) {
            if (!dayData?.segments) continue;
            for (const segment of dayData.segments) {
                if (segment.type !== "stay" || segment.zoneName) continue;
                if (this._stayCacheKey(segment.center) !== stayKey) continue;
                if (segment.placeName === "Loading address...") continue;
                if (!segment.placeName) continue;
                return {
                    name: segment.placeName,
                    result: segment.reverseGeocoding ?? null,
                };
            }
        }
        return null;
    }

    _stayCacheKey(center) {
        if (!center) return "unknown";
        return `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`;
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
        this._ensureBaseLayout();

        const dateKey = toDateKey(this._selectedDate);
        const dayData = this._cache.get(dateKey) || {
            loading: false, segments: null, points: null, error: null
        };
        const isFuture = this._selectedDate >= startOfDay(new Date());

        const dateEl = this.shadowRoot.getElementById("timeline-date");
        dateEl.textContent = formatDate(this._selectedDate);

        const datePicker = this.shadowRoot.getElementById("timeline-date-picker");
        datePicker.value = toDateKey(this._selectedDate);
        datePicker.max = toDateKey(new Date());

        const nextButton = this.shadowRoot.querySelector("[data-action='next']");
        nextButton.toggleAttribute("disabled", isFuture);

        const body = this.shadowRoot.getElementById("timeline-body");
        this._bindTimelineTouch(body);
        this._updateMapResetButton();
        body.innerHTML = `
              ${dayData.error ? `<div class="error">${dayData.error}</div>` : ""}
              ${dayData.loading ? `<div class="loading">Loading timeline...</div>` : ""}
              ${!dayData.loading && !dayData.error ? renderTimeline(dayData.segments) : ""}
            `;
        this._attachMapCard();
        requestAnimationFrame(() => {
            this._refreshMapPaths();
        });
        this._rendered = true;
    }

    _ensureBaseLayout() {
        if (this._baseLayoutReady) return;
        this._baseLayoutReady = true;

        this.shadowRoot.innerHTML = `
          <style>${css}\n${leafletCss}</style>
          <ha-card>
            <div class="card">
              <div class="map-wrap">
                <div id="overview-map"></div>
                <ha-icon-button id="map-reset-zoom" class="map-reset" data-action="reset-map-zoom" label="Reset map zoom" hidden><ha-icon icon="mdi:magnify-expand"></ha-icon></ha-icon-button>
              </div>
              <div class="header my-header">
                <ha-icon-button class="nav-button" data-action="prev" label="Previous day"><ha-icon icon="mdi:chevron-left"></ha-icon></ha-icon-button>
                <div class="date-wrap">
                  <button class="date-trigger" data-action="open-date-picker" type="button" aria-label="Pick date">
                    <span id="timeline-date" class="date"></span>
                    <ha-icon class="date-caret" icon="mdi:menu-down"></ha-icon>
                  </button>
                  <input id="timeline-date-picker" class="date-picker-input" type="date">
                </div>
                <div class="header-actions">
                  <ha-icon-button class="nav-button" data-action="refresh" label="Refresh"><ha-icon icon="mdi:refresh"></ha-icon></ha-icon-button>
                  <ha-icon-button class="nav-button" data-action="next" label="Next day"><ha-icon icon="mdi:chevron-right"></ha-icon></ha-icon-button>
                </div>
              </div>
              <div id="timeline-body" class="body"></div>
            </div>
          </ha-card>
        `;
    }


    _openDatePicker() {
        const input = this.shadowRoot?.getElementById("timeline-date-picker");
        if (!input) return;
        if (typeof input.showPicker === "function") {
            input.showPicker();
            return;
        }
        input.focus();
        input.click();
    }

    _updateMapResetButton() {
        const resetBtn = this.shadowRoot?.getElementById("map-reset-zoom");
        if (!resetBtn) return;
        resetBtn.toggleAttribute("hidden", !this._mapView?.isMapZoomedToSegment);
    }

    _bindTimelineTouch(body) {
        if (!body || body.dataset.swipeBound === "true") return;
        body.dataset.swipeBound = "true";

        body.addEventListener("touchstart", (event) => {
            const touch = event.changedTouches?.[0];
            if (!touch) return;
            this._touchStart = {x: touch.clientX, y: touch.clientY};
        }, {passive: true});

        body.addEventListener("touchend", (event) => {
            const touch = event.changedTouches?.[0];
            if (!touch || !this._touchStart) return;

            const deltaX = touch.clientX - this._touchStart.x;
            const deltaY = touch.clientY - this._touchStart.y;
            this._touchStart = null;

            if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) {
                return;
            }

            this._shiftDate(deltaX > 0 ? -1 : 1);
        }, {passive: true});
    }

    async _attachMapCard() {
        const container = this.shadowRoot.getElementById("overview-map");
        if (!container || this._mapView || this._isLoadingMap) return;
        if (!this.isConnected || !container.isConnected) {
            requestAnimationFrame(() => this._attachMapCard());
            return;
        }

        this._isLoadingMap = true;
        try {
            this._mapView = new TimelineLeafletMap(container);
            this._refreshMapPaths();
            this._mapView.fitMap({defer: true});
        } catch (err) {
            console.warn("Timeline card: map setup failed", err);
        } finally {
            this._isLoadingMap = false;
        }
    }

    disconnectedCallback() {
        if (!this._mapView) return;
        this._mapView.destroy();
        this._mapView = null;
    }

    _refreshMapPaths() {
        const dayData = this._getCurrentDayData();
        if (!dayData || dayData.loading || dayData.error || !this._mapView) return;

        this._mapView.setDaySegments(dayData);
        this._touchStart = null;

        this._updateMapResetButton();
        this._mapView.fitMap();
    }

    _handleSegmentHoverStart(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || !Array.isArray(dayData.segments)) return;

        const segment = dayData.segments[segmentIndex];
        if (!segment || !this._mapView) return;

        const segments = Array.isArray(dayData.segments) ? dayData.segments : [];
        this._touchStart = null;
        this._mapView.highlightSegment(segment, segments);
    }

    _clearHoverHighlight() {
        if (!this._mapView) return;
        const dayData = this._getCurrentDayData();
        const segments = Array.isArray(dayData?.segments) ? dayData.segments : [];
        this._touchStart = null;
        this._mapView.clearHighlight(segments);
    }

    _handleSegmentClick(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || !Array.isArray(dayData.segments)) return;

        const segment = dayData.segments[segmentIndex];
        if (!segment) return;

        if (segment.type === "stay") {
            this._mapView?.zoomToStay(segment);
            this._updateMapResetButton();
        } else if (segment.type === "move") {
            const segmentPoints = this._extractSegmentPoints(dayData.points, segment);
            if (segmentPoints.length < 2) return;
            this._mapView?.zoomToPoints(segmentPoints.map(toLatLon));
            this._updateMapResetButton();
        }
    }

    _extractSegmentPoints(points, segment) {
        if (!Array.isArray(points)) return [];
        return points.filter((point) => point.timestamp >= segment.start && point.timestamp <= segment.end);
    }

    _getCurrentDayData() {
        return this._cache.get(toDateKey(this._selectedDate));
    }

    _formatErrorMessage(err) {
        const message = err && err.message ? String(err.message) : "";
        if (message.toLowerCase().includes("unknown command")) {
            return "History WebSocket API not available. Ensure the Recorder/History integration is enabled.";
        }
        return message || "Unable to load history";
    }
}

customElements.define("location-timeline-card", TimelineCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "location-timeline-card",
    name: "Location Timeline Card",
    description: "Daily location timeline from GPS history.",
});

