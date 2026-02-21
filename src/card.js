import css from "./card.css";
import {fetchEntityHistory, fetchHistory} from "./history.js";
import {segmentTimeline} from "./segmentation.js";
import {renderTimeline} from "./timeline.js";
import {formatDate, startOfDay, toDateKey, toLatLon} from "./utils.js";
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
        this.attachShadow({mode: "open"});
        this._config = {...DEFAULT_CONFIG};
        this._cache = new Map();
        this._selectedDate = startOfDay(new Date());
        this._hass = null;
        this._rendered = false;
        this._fullDayPaths = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._touchStart = null;
        this._isMapZoomedToSegment = false;

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
                this._ensureDay(this._selectedDate);
                this._render();
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
        const today = startOfDay(new Date());
        if (direction > 0 && this._selectedDate >= today) {
            return;
        }

        const next = new Date(this._selectedDate);
        next.setDate(next.getDate() + direction);
        this._selectedDate = startOfDay(next);
        this._ensureDay(this._selectedDate);
        this._render();
    }

    _resetMapZoom() {
        this._isMapZoomedToSegment = false;
        this._updateMapResetButton();
        this._fitMap();
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

        this._cache.set(key, {loading: true, segments: null, points: null, error: null, debug: null});
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
                first: points[0]?.timestamp || null,
                last: points[points.length - 1]?.timestamp || null,
            };
            this._cache.set(key, {loading: false, segments, points, error: null, debug});
        } catch (err) {
            console.warn("Timeline card: history fetch failed", err);
            this._cache.set(key, {
                loading: false,
                segments: null,
                points: null,
                error: this._formatErrorMessage(err),
                debug: null,
            });
        }
        this._render();
        requestAnimationFrame(() => {
            this._refreshMapPaths();
        });
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
            loading: false, segments: null, points: null, error: null, debug: null
        };
        const isFuture = this._selectedDate >= startOfDay(new Date());

        const dateEl = this.shadowRoot.getElementById("timeline-date");
        dateEl.textContent = formatDate(this._selectedDate);

        const datePicker = this.shadowRoot.getElementById("timeline-date-picker");
        if (datePicker) {
            datePicker.value = toDateKey(this._selectedDate);
            datePicker.max = toDateKey(new Date());
        }

        const nextButton = this.shadowRoot.querySelector("[data-action='next']");
        nextButton.toggleAttribute("disabled", isFuture);

        const body = this.shadowRoot.getElementById("timeline-body");
        this._bindTimelineTouch(body);
        this._updateMapResetButton();
        body.innerHTML = `
              ${dayData.error ? `<div class="error">${dayData.error}</div>` : ""}
              ${dayData.loading ? `<div class="loading">Loading timeline...</div>` : ""}
              ${!dayData.loading && !dayData.error ? renderTimeline(dayData.segments) : ""}
              ${this._config.show_debug ? this._renderDebug(dayData) : ""}
            `;
        this._attachMapCard();
    }

    _ensureBaseLayout() {
        if (this._baseLayoutReady) return;
        this._baseLayoutReady = true;

        this.shadowRoot.innerHTML = `
          <style>${css}</style>
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
        resetBtn.toggleAttribute("hidden", !this._isMapZoomedToSegment);
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
        await this._createMapCard();

        const container = this.shadowRoot.getElementById("overview-map");
        if (!container) return;

        if (!container.contains(this._mapCard)) {
            container.innerHTML = "";
            container.appendChild(this._mapCard);
        }

        this._mapCard.updateComplete?.then(() => {this._fillMapCard();});
    }

    async _createMapCard() {
        if (this._mapCard) return;

        const helpers = await window.loadCardHelpers();

        this._mapCard = await helpers.createCardElement({
            type: "map",
            entities: [this._config.entity]
        });

        if (this._hass) {
            this._mapCard.hass = this._hass;
        }
    }

    async _fillMapCard() {
        const haMap = this._mapCard.shadowRoot?.querySelector("ha-map");
        if (!haMap) return;

        this._mapCard._mapEntities = [];
        this._mapCard.requestUpdate?.();
        await this._mapCard.updateComplete;

        await haMap.updateComplete?.catch(() => {});
        if (!haMap.leafletMap) {
            requestAnimationFrame(() => this._fillMapCard());
            return;
        }
        haMap.style.height = "200px";
        haMap.autoFit = false;

        this._mapCard._mapEntities = [];
        this._mapCard.requestUpdate?.();
        await this._mapCard.updateComplete;

        this._refreshMapPaths();
        this._fitMap(true);
    }

    _refreshMapPaths() {
        if (!this._mapCard) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || dayData.loading || dayData.error) return;

        const points = Array.isArray(dayData.points) ? dayData.points : [];
        this._fullDayPaths = points.length > 1 ? [{points: points, color: "var(--primary-color)", weight: 4}] : [];

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._touchStart = null;

        this._drawMapPaths();
        this._isMapZoomedToSegment = false;
        this._updateMapResetButton();
        this._fitMap();
    }

    _drawMapPaths() {
        const haMap = this._mapCard?.shadowRoot?.querySelector("ha-map");
        const Leaflet = haMap?.Leaflet;
        if (!haMap || !Leaflet) return;

        haMap._mapPaths.forEach((marker) => marker.remove());
        haMap._mapPaths = [];

        this._drawMapLines(haMap, Leaflet);
        this._drawMapMarkers(haMap, Leaflet);
        haMap._mapPaths.forEach((marker) => haMap.leafletMap.addLayer(marker));
    }

    _drawMapMarkers(haMap, Leaflet) {
        const dayData = this._getCurrentDayData();
        const segments = Array.isArray(dayData.segments) ? dayData.segments : [];
        const stayMarkers = segments.filter(segment => segment?.type === "stay");

        stayMarkers.forEach((stay) => {
            let haIcon = document.createElement("ha-icon");
            haIcon.setAttribute("icon", stay.zoneIcon || "mdi:map-marker");
            haIcon.setAttribute("style", "color: white; --mdc-icon-size: 14px; padding: 2px")

            let iconDiv = document.createElement("div");
            iconDiv.appendChild(haIcon);
            iconDiv.setAttribute("style", "height: 18px; width: 18px; background-color: var(--primary-color); " +
                "border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, var(--primary-color)); " +
                "display: flex;")

            let icon = Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [22, 22]});
            haMap._mapPaths.push(Leaflet.marker(stay.center, {icon, zIndexOffset: 100}))
        });

        if (this._highlightedStay) {
            let haIcon = document.createElement("ha-icon");
            haIcon.setAttribute("icon", this._highlightedStay.zoneIcon || "mdi:map-marker");
            haIcon.setAttribute("style", "color: white; --mdc-icon-size: 22px;")

            let iconDiv = document.createElement("div");
            iconDiv.appendChild(haIcon);
            iconDiv.setAttribute("style", "height: 22px; width: 22px; background-color: var(--accent-color); " +
                "border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, var(--accent-color))")

            let icon = Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [26, 26]});
            haMap._mapPaths.push(Leaflet.marker(this._highlightedStay.center, {icon, zIndexOffset: 1000}))

        }
    }

    _drawMapLines(haMap, Leaflet) {
        const paths = [...this._fullDayPaths, ...this._highlightedPath];

        paths.forEach((path) => {
            haMap._mapPaths.push(
                Leaflet.polyline(path.points.map(point => point.point), {
                    color: `color-mix(in srgb, black 30%, ${path.color})`,
                    opacity: 1,
                    weight: path?.weight + 3,
                    interactive: false,
                })
            );
            haMap._mapPaths.push(
                Leaflet.polyline(path.points.map(point => point.point), {
                    color: path.color,
                    opacity: 1,
                    weight: path?.weight,
                    interactive: false,
                })
            );
        });
    }

    _fitMap(defer=false, bounds=null, pad = 0.1) {
        const haMap = this._mapCard?.shadowRoot?.querySelector("ha-map");
        const Leaflet = haMap?.Leaflet;
        if (!haMap || !Leaflet) return;
        if (bounds === null) {
            if (!this._fullDayPaths.length) return;
            bounds = this._fullDayPaths[0].points.map(toLatLon);
        }
        bounds = haMap.Leaflet.latLngBounds(bounds).pad(pad);

        const doFit = () => { haMap.leafletMap.fitBounds(bounds, {maxZoom: 14}); };
        if (defer) {
            requestAnimationFrame(() => requestAnimationFrame(doFit));
        } else {
            doFit();
        }
    }

    _handleSegmentHoverStart(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || !Array.isArray(dayData.segments)) return;

        const segment = dayData.segments[segmentIndex];
        if (!segment) return;

        const haMap = this._mapCard?.shadowRoot?.querySelector("ha-map");
        if (!haMap) return;

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._touchStart = null;

        if (segment.type === "stay") {
            this._highlightedStay = segment;
            this._drawMapPaths();
        } else if (segment.type === "move") {
            this._highlightedPath = [{points: segment.points, color: "var(--accent-color)", weight: 7, opacity: 1,}];
            this._isTravelHighlightActive = true;
            this._drawMapPaths();
        }
    }

    _clearHoverHighlight() {
        if (!this._highlightedPath.length && !this._highlightedStay && !this._isTravelHighlightActive) {
            return;
        }
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._touchStart = null;
        this._drawMapPaths();
    }

    _handleSegmentClick(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || !Array.isArray(dayData.segments)) return;

        const segment = dayData.segments[segmentIndex];
        if (!segment) return;

        if (segment.type === "stay") {
            this._isMapZoomedToSegment = true;
            this._updateMapResetButton();
            this._fitMap(false, [segment.center]);
        } else if (segment.type === "move") {
            const segmentPoints = this._extractSegmentPoints(dayData.points, segment);
            if (segmentPoints.length < 2) return;
            this._isMapZoomedToSegment = true;
            this._updateMapResetButton();
            this._fitMap(false, segmentPoints.map(toLatLon));
        }
    }

    _extractSegmentPoints(points, segment) {
        if (!Array.isArray(points)) return [];
        return points.filter((point) => point.timestamp >= segment.start && point.timestamp <= segment.end);
    }

    _getCurrentDayData() {
        return this._cache.get(toDateKey(this._selectedDate));
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
