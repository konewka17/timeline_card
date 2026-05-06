import css from "./card.css";
import leafletCss from "leaflet/dist/leaflet.css";
import {getSegmentedTracks} from "./segmentation.js";
import {
    escapeHtml,
    formatDate,
    formatErrorMessage,
    getTrackColor,
    isToday,
    normalizeEntityEntries,
    normalizeList,
    startOfDay,
    today,
    toLatLon,
} from "./utils.js";
import {TimelineLeafletMap} from "./leaflet-map.js";
import {clearPersistentCache, clearReverseGeocodingQueue} from "./reverse-geocoding.js";
import {renderTimeline} from "./timeline.js";
import {getConfigFormSchema} from "./config-flow.js";
import {localize} from "./localize/localize.js";

const DEFAULT_CONFIG = {
    entity: [],
    places_entity: [],
    osm_api_key: null,
    stay_radius_m: 75,
    min_stay_minutes: 10,
    max_reasonable_speed_kmh: 300,
    map_appearance: "auto",
    map_height_px: 200,
    distance_unit: "metric",
    colors: [],
    hide_current_location: false,
    hide_moving: false,
    collapse_timeline: false,
    timeline_use_entity_color: false,
    debug: false,
    activity_icon_map: {},
    update_interval: 300,
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
        this._activeEntityIndex = 0;
        this._timelineCollapsed = false;
        this._updateIntervalId = null;
        this._resetMapFitMode();
        this._addEventListeners();
    }

    // noinspection JSUnusedGlobalSymbols
    setConfig(config) {
        this._config = {...DEFAULT_CONFIG, ...config};
        this._checkConfig();

        this._cache.clear();
        if (this._config.debug) {
            clearPersistentCache();
        }

        this._activeEntityIndex = 0;
        this._timelineCollapsed = Boolean(this._config.collapse_timeline);
        this._selectedDate = startOfDay(new Date());
        this._resetMapFitMode();
        this._setDarkMode();
        this._renderEntitySelector(true);
        this._applyMapHeight();
        if (this._hass) {
            this._ensureDay(this._selectedDate);
        }
        this._setupUpdateInterval();
        this._render();
    }

    // noinspection JSUnusedGlobalSymbols
    set hass(hass) {
        this._hass = hass;
        this._setDarkMode();
        this._renderEntitySelector();
        if (!this._config.entity) return;
        this._config.entity = normalizeEntityEntries(this._config, this._hass);
        const dateKey = formatDate(this._selectedDate);
        if (!this._cache.has(dateKey)) {
            this._ensureDay(this._selectedDate);
        }
        if (!this._rendered) {
            this._render();
            this._rendered = true;
        }
    }

    // noinspection JSUnusedGlobalSymbols
    static getConfigForm() {
        return getConfigFormSchema();
    }

    // noinspection JSUnusedGlobalSymbols
    getCardSize() {
        return 10;
    }

    // noinspection JSUnusedGlobalSymbols
    disconnectedCallback() {
        if (this._updateIntervalId) {
            clearInterval(this._updateIntervalId);
            this._updateIntervalId = null;
        }
    }

    _checkConfig() {
        this._config.entity = normalizeEntityEntries(this._config);
        this._config.places_entity = normalizeList(this._config.places_entity);
        this._config.colors = normalizeList(this._config.colors);
        if (this._config.entity.length === 0) {
            throw new Error("You need to define an entity");
        }
        if (!["metric", "imperial"].includes(this._config.distance_unit)) {
            throw new Error("distance_unit must be either 'metric' or 'imperial'");
        }
        if (!["auto", "light", "dark"].includes(this._config.map_appearance)) {
            throw new Error("map_appearance must be one of 'auto', 'light', or 'dark'");
        }
    }

    _setDarkMode() {
        let darkMode = Boolean(this._hass?.themes?.darkMode);
        if (this._config.map_appearance === "dark") {
            darkMode = true;
        } else if (this._config.map_appearance === "light") {
            darkMode = false;
        }
        this._mapView?.setDarkMode(darkMode);
    }

    _applyMapHeight() {
        const mapElement = this.shadowRoot?.getElementById("overview-map");
        if (!mapElement) return;
        mapElement.style.setProperty("height", `${this._config.map_height_px}px`, "important");
    }

    // Actions
    _shiftDate(direction) {
        clearReverseGeocodingQueue();

        const today = startOfDay(new Date());
        if (direction > 0 && this._selectedDate >= today) {
            return;
        }

        const next = new Date(this._selectedDate);
        next.setDate(next.getDate() + direction);
        this._selectedDate = startOfDay(next);
        this._resetMapFitMode();
        this._ensureDay(this._selectedDate).then(() => this._render());
    }

    _resetMapFitMode() {
        if (isToday(this._selectedDate) && !this._config.hide_current_location) {
            this._mapFitMode = "current_location";
        } else {
            this._mapFitMode = "selected_entity_path";
        }
    }

    _refreshCurrentDay() {
        const key = formatDate(this._selectedDate);
        this._cache.delete(key);
        this._ensureDay(this._selectedDate).then(() => this._render());
    }

    _logCacheToConsole() {
        console.log("%c[Location Timeline Debug]", "color: white; background-color: #03a9f4; font-weight: bold;");
        console.log(JSON.stringify(this._cache.get(formatDate(this._selectedDate))));
    }

    _setupUpdateInterval() {
        if (this._updateIntervalId) {
            clearInterval(this._updateIntervalId);
            this._updateIntervalId = null;
        }

        const interval = Number(this._config.update_interval);
        if (interval > 0) {
            this._updateIntervalId = setInterval(() => {
                if (isToday(this._selectedDate)) {
                    this._refreshCurrentDay();
                }
            }, interval * 1000);
        }
    }

    // Rendering
    _render() {
        if (!this.shadowRoot) return;
        this._ensureBaseLayout();

        const dateKey = formatDate(this._selectedDate);
        const dayData = this._cache.get(dateKey) || {
            loading: false,
            tracks: null,
            error: null,
        };

        this.shadowRoot.getElementById("timeline-date").textContent = formatDate(
            this._selectedDate,
            this._hass?.locale,
        );
        const datePicker = this.shadowRoot.getElementById("timeline-date-picker");
        datePicker.value = formatDate(this._selectedDate);
        datePicker.max = formatDate(new Date());

        this.shadowRoot
            .querySelector("[data-action='next']")
            .toggleAttribute("disabled", this._selectedDate >= today());
        this._applyMapHeight();

        this._updateMapFitButton();
        this._updateCollapseButtons();

        const activeEntityColor = getTrackColor(
            this._activeEntityIndex,
            this._config?.colors,
            this._config?.entity?.[this._activeEntityIndex]?.color,
        );
        if (this._config.timeline_use_entity_color) {
            this.shadowRoot.querySelector(".card")?.style.setProperty("--timeline-color", activeEntityColor);
        }

        const activeDayData = this._getCurrentTrackDayData(dayData);
        this.shadowRoot.getElementById("timeline-body").innerHTML = this._renderTimelineContent(activeDayData);

        this._attachMapCard();
        this._rendered = true;
        requestAnimationFrame(() => this._drawMapPaths());
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
                <ha-icon-button id="map-fit-mode" class="map-reset" data-action="update-map-fit-mode"><ha-icon></ha-icon></ha-icon-button>
                <ha-icon-button id="timeline-collapse-map" class="map-reset map-reset-left" data-action="toggle-timeline-collapse" hidden>
                  <ha-icon></ha-icon>
                </ha-icon-button>
              </div>
              <div class="selector-row" id="selector-row" hidden>
                <ha-icon-button id="timeline-collapse-selector" class="selector-collapse" data-action="toggle-timeline-collapse">
                  <ha-icon></ha-icon>
                </ha-icon-button>
                <div id="entity-selector" class="entity-selector"></div>
              </div>
              <div id="timeline-section" class="timeline-section">
                <div class="timeline-content">
                <div class="header my-header">
                  <div class="header-actions">
                      <ha-icon-button class="nav-button" data-action="prev" label="${localize("card.labels.previous_day")}"><ha-icon icon="mdi:chevron-left"></ha-icon></ha-icon-button>
                      ${this._config.debug ? `<ha-icon-button class="nav-button" data-action="debug" label="${localize("card.labels.debug")}"><ha-icon icon="mdi:bug"></ha-icon></ha-icon-button>` : ""}
                  </div>
                  <div class="date-wrap">
                    <button class="date-trigger" data-action="open-date-picker" type="button" aria-label="${localize("card.labels.pick_date")}">
                      <span id="timeline-date" class="date"></span>
                      <ha-icon class="date-caret" icon="mdi:menu-down"></ha-icon>
                    </button>
                    <input id="timeline-date-picker" class="date-picker-input" type="date">
                  </div>
                  <div class="header-actions">
                    <ha-icon-button class="nav-button" data-action="refresh" label="${localize("card.labels.refresh")}"><ha-icon icon="mdi:refresh"></ha-icon></ha-icon-button>
                    <ha-icon-button class="nav-button" data-action="next" label="${localize("card.labels.next_day")}"><ha-icon icon="mdi:chevron-right"></ha-icon></ha-icon-button>
                  </div>
                </div>
                <div id="timeline-body" class="body"></div>
                </div>
              </div>
            </div>
          </ha-card>
        `;

        const body = this.shadowRoot.getElementById("timeline-body");
        this._bindTimelineTouch(body);
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

    _updateMapFitButton() {
        const fitToggleBtn = this.shadowRoot?.getElementById("map-fit-mode");
        if (!fitToggleBtn) return;
        const icon = fitToggleBtn.querySelector("ha-icon");

        if (this._mapFitMode === "segment") {
            fitToggleBtn.toggleAttribute("hidden", false);
            icon.setAttribute("icon", "mdi:magnify-scan");
            fitToggleBtn.setAttribute("label", "Switch to full path fit");
        } else if (isToday(this._selectedDate) && !this._config.hide_current_location) {
            fitToggleBtn.toggleAttribute("hidden", false);
            if (this._mapFitMode === "current_location") {
                icon.setAttribute("icon", "mdi:magnify-scan");
                fitToggleBtn.setAttribute("label", "Switch to full path fit");
            } else {
                icon.setAttribute("icon", "mdi:crosshairs-gps");
                fitToggleBtn.setAttribute("label", "Switch to current location fit");
            }
        } else {
            fitToggleBtn.toggleAttribute("hidden", true);
        }
    }

    _attachMapCard() {
        const container = this.shadowRoot.getElementById("overview-map");
        if (!container || this._mapView || this._isLoadingMap) return;
        if (!this.isConnected || !container.isConnected) {
            requestAnimationFrame(() => this._attachMapCard());
            return;
        }

        this._isLoadingMap = true;
        try {
            this._mapView = new TimelineLeafletMap(container);
            this._setDarkMode();
            this._drawMapPaths();
        } catch (err) {
            console.warn("Timeline card: map setup failed", err);
        } finally {
            this._isLoadingMap = false;
        }
    }

    _drawMapPaths() {
        const dayData = this._getCurrentDayData();
        if (!dayData || dayData.loading || dayData.error || !this._mapView) return;

        try {
            const tracks = Array.isArray(dayData.tracks) ? dayData.tracks : [];
            if (!this._config.hide_current_location) {
                this._mapView._currentLocations = this._getCurrentEntityLocations();
            }
            this._mapView.setDaySegments(
                tracks,
                this._activeEntityIndex,
                (entityIndex) => this._setActiveEntityIndex(entityIndex),
                this._config.colors,
            );
            this._touchStart = null;

            this._updateMapFitButton();
            this._fitMapToCurrentMode();
        } catch (err) {
            this._setCurrentDayError(err);
            this._render();
        }
    }

    _renderEntitySelector(force_rerender = false) {
        if (!this._baseLayoutReady) return;
        if (this._entitySelectorRendered && !force_rerender) return;
        this._entitySelectorRendered = true;

        const entities = this._config.entity;
        const selector = this.shadowRoot?.getElementById("entity-selector");
        const selectorRow = this.shadowRoot?.getElementById("selector-row");
        if (!selector || !selectorRow) return;
        if (entities.length < 2) {
            selectorRow.toggleAttribute("hidden", true);
            return;
        }

        selectorRow.toggleAttribute("hidden", false);
        selector.innerHTML = entities
            .map(({entity: entityId}, index) => {
                const state = this._hass?.states?.[entityId];
                const picture = state?.attributes?.entity_picture;
                const name = state?.attributes?.friendly_name || entityId;
                const escapedName = escapeHtml(name);
                const escapedPicture = escapeHtml(picture || "");
                const entityDef = this._config.entity[index];
                const trackColor = getTrackColor(index, this._config?.colors, entityDef?.color);
                return `
              <button type="button" style="--entity-track-color:${trackColor};" class="entity-chip ${index === this._activeEntityIndex ? "active" : ""}" data-action="select-entity" data-entity-index="${index}">
                ${picture ? `<img src="${escapedPicture}" alt="${escapedName}">` : '<ha-icon class="entity-avatar-icon" icon="mdi:account-circle"></ha-icon>'}
                <span>${escapedName}</span>
              </button>
            `;
            })
            .join("");
        selector.toggleAttribute("hidden", this._config.entity.length < 2);
        this._updateCollapseButtons();
    }

    _updateCollapseButtons() {
        const selectorCollapseBtn = this.shadowRoot?.getElementById("timeline-collapse-selector");
        const mapCollapseBtn = this.shadowRoot?.getElementById("timeline-collapse-map");
        const timelineSection = this.shadowRoot?.getElementById("timeline-section");
        if (!selectorCollapseBtn || !mapCollapseBtn || !timelineSection) return;

        const useSelectorButton = this._config.entity.length > 1;
        const useMapButton = this._config.entity.length < 2;
        const icon = this._timelineCollapsed ? "mdi:chevron-down" : "mdi:chevron-up";
        const label = this._timelineCollapsed ? "Expand timeline" : "Collapse timeline";

        selectorCollapseBtn.toggleAttribute("hidden", !useSelectorButton);
        mapCollapseBtn.toggleAttribute("hidden", !useMapButton);

        selectorCollapseBtn.querySelector("ha-icon")?.setAttribute("icon", icon);
        mapCollapseBtn.querySelector("ha-icon")?.setAttribute("icon", icon);
        selectorCollapseBtn.setAttribute("label", label);
        mapCollapseBtn.setAttribute("label", label);

        timelineSection.classList.toggle("collapsed", this._timelineCollapsed);
    }

    _renderTimelineContent(dayData) {
        if (dayData.loading || dayData.error) {
            const errorHtml = dayData.error ? `<div class="error">${dayData.error}</div>` : "";
            const loadingHtml = dayData.loading
                ? `<div class="loading">${localize("card.timeline.loading")}</div>`
                : "";
            return `${errorHtml}${loadingHtml}`;
        }

        try {
            return renderTimeline(dayData.segments, this._hass?.locale, this._config);
        } catch (err) {
            const message = formatErrorMessage(err);
            console.warn("Timeline card: timeline render failed", err);
            this._setCurrentDayError(err);
            return `<div class="error">${message}</div>`;
        }
    }

    // Functions
    async _ensureDay(date) {
        const key = formatDate(date);
        const existing = this._cache.get(key);
        if (existing && (existing.tracks || existing.loading)) return;

        this._cache.set(key, {loading: true, tracks: null, error: null});

        try {
            const tracks = await getSegmentedTracks(date, this._config, this._hass, () => {
                this._render();
            });
            this._cache.set(key, {loading: false, tracks, error: null});
        } catch (err) {
            console.warn("Timeline card: history fetch failed", err);
            this._cache.set(key, {
                loading: false,
                tracks: null,
                error: formatErrorMessage(err),
            });
        }
        this._render();
        requestAnimationFrame(() => this._drawMapPaths());
    }

    _getCurrentDayData() {
        return this._cache.get(formatDate(this._selectedDate));
    }

    _getCurrentTrackDayData(dayData = this._getCurrentDayData()) {
        const tracks = Array.isArray(dayData?.tracks) ? dayData.tracks : [];
        const index = Math.min(this._activeEntityIndex, Math.max(0, tracks.length - 1));
        this._activeEntityIndex = index;
        return (
            tracks[index] || {
                segments: [],
                points: [],
                entityId: null,
                placeEntityId: null,
            }
        );
    }

    _setActiveEntityIndex(index) {
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this._config.entity.length ||
            index === this._activeEntityIndex
        ) {
            return;
        }
        this._activeEntityIndex = index;
        this._renderEntitySelector(true);
        this._render();
    }

    _fitMapToCurrentMode() {
        let bounds = null;
        if (isToday(this._selectedDate) && this._mapFitMode === "current_location") {
            bounds = this._getCurrentEntityLocations().map((point) => point.point);
        }
        this._mapView.fitMap(bounds);
    }

    _updateMapFitMode() {
        if (this._mapFitMode === "current_location") {
            this._mapFitMode = "selected_entity_path";
        } else {
            this._resetMapFitMode();
        }
        this._updateMapFitButton();
        this._fitMapToCurrentMode();
    }

    _getCurrentEntityLocations() {
        if (!isToday(this._selectedDate)) {
            return [];
        }

        return this._config.entity
            .map(({entity: entityId}, index) => {
                const state = this._hass?.states?.[entityId];
                const lat = Number(state?.attributes?.latitude);
                const lon = Number(state?.attributes?.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

                return {
                    point: [lat, lon],
                    picture: state?.attributes?.entity_picture || null,
                    name: state?.attributes?.friendly_name || entityId,
                    color: getTrackColor(index, this._config?.colors, this._config.entity[index]?.color),
                    isActive: index === this._activeEntityIndex,
                };
            })
            .filter(Boolean);
    }

    _setCurrentDayError(err) {
        const key = formatDate(this._selectedDate);
        const current = this._cache.get(key) || {
            loading: false,
            segments: null,
            points: null,
            error: null,
        };
        this._cache.set(key, {
            ...current,
            loading: false,
            error: formatErrorMessage(err),
        });
    }

    // Event listeners
    _addEventListeners() {
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
            } else if (action === "update-map-fit-mode") {
                this._updateMapFitMode();
            } else if (action === "debug") {
                this._logCacheToConsole();
            } else if (action === "open-date-picker") {
                this._openDatePicker();
            } else if (action === "select-entity") {
                this._setActiveEntityIndex(Number(target.dataset.entityIndex));
            } else if (action === "toggle-timeline-collapse") {
                this._timelineCollapsed = !this._timelineCollapsed;
                this._updateCollapseButtons();
            }
        });

        this.shadowRoot.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.id !== "timeline-date-picker" || !target.value) return;
            const next = new Date(`${target.value}T00:00:00`);
            if (!Number.isNaN(next.getTime())) {
                this._selectedDate = startOfDay(next);
                this._resetMapFitMode();
                this._ensureDay(this._selectedDate).then(() => this._render());
            }
        });

        this.shadowRoot.addEventListener("mouseover", (e) =>
            this._onSegmentEvent(e, (idx) => this._handleSegmentHoverStart(idx)),
        );
        this.shadowRoot.addEventListener("mouseout", (e) =>
            this._onSegmentEvent(e, (idx) => this._clearHoverHighlight(idx)),
        );
        this.shadowRoot.addEventListener("click", (e) =>
            this._onSegmentEvent(e, (idx) => this._handleSegmentClick(idx)),
        );
    }

    _onSegmentEvent(e, callback) {
        const entry = e.target.closest("[data-segment-index]");
        if (!entry || !this.shadowRoot.contains(entry)) return;
        if (entry.contains(e.relatedTarget)) return;
        callback(Number(entry.dataset.segmentIndex));
    }

    _handleSegmentHoverStart(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        const track = this._getCurrentTrackDayData(dayData);
        if (!track || !Array.isArray(track.segments)) return;

        const segment = track.segments[segmentIndex];
        if (!segment || !this._mapView) return;

        const segments = Array.isArray(track.segments) ? track.segments : [];
        this._touchStart = null;
        this._mapView.highlightSegment(segment, segments);
    }

    _clearHoverHighlight() {
        if (!this._mapView) return;
        const dayData = this._getCurrentDayData();
        const track = this._getCurrentTrackDayData(dayData);
        const segments = Array.isArray(track?.segments) ? track.segments : [];
        this._touchStart = null;
        this._mapView.clearHighlight(segments);
    }

    _handleSegmentClick(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        const track = this._getCurrentTrackDayData(dayData);
        if (!track || !Array.isArray(track.segments)) return;

        const segment = track.segments[segmentIndex];
        if (!segment) return;

        this._mapFitMode = "segment";
        this._updateMapFitButton();
        if (segment.type === "stay") {
            this._mapView?.fitMap([segment.center]);
        } else if (segment.type === "move") {
            const segmentPoints = track.points.filter(
                (point) => point.timestamp >= segment.start && point.timestamp <= segment.end,
            );
            if (segmentPoints.length < 2) return;
            this._mapView?.fitMap(segmentPoints.map(toLatLon));
        }
    }

    _bindTimelineTouch(body) {
        if (!body || body.dataset.swipeBound === "true") return;
        body.dataset.swipeBound = "true";

        body.addEventListener(
            "touchstart",
            (event) => {
                const touch = event.changedTouches?.[0];
                if (!touch) return;
                this._touchStart = {x: touch.clientX, y: touch.clientY};
            },
            {passive: true},
        );

        body.addEventListener(
            "touchend",
            (event) => {
                const touch = event.changedTouches?.[0];
                if (!touch || !this._touchStart) return;

                const deltaX = touch.clientX - this._touchStart.x;
                const deltaY = touch.clientY - this._touchStart.y;
                this._touchStart = null;

                if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY)) {
                    return;
                }

                this._shiftDate(deltaX > 0 ? -1 : 1);
            },
            {passive: true},
        );
    }
}

customElements.define("location-timeline-card", TimelineCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "location-timeline-card",
    name: "Location Timeline Card",
    description: localize("card.description"),
});
