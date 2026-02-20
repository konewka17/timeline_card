var css = ":host {\n  display: block;\n  font-family: var(--ha-card-header-font-family, \"Helvetica Neue\", Arial, sans-serif);\n}\n\nha-card {\n  overflow: hidden;\n}\n\n.card {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n}\n\n.header {\n  position: sticky;\n  top: 0;\n  z-index: 2;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 16px;\n  background: var(--card-background-color, var(--ha-card-background, #fff));\n  border-bottom: 1px solid var(--divider-color);\n  flex-wrap: nowrap;\n}\n\n.date {\n  font-size: 1rem;\n  font-weight: 600;\n  text-align: center;\n  flex: 1;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.nav-button {\n  --mdc-icon-button-size: 36px;\n  color: var(--primary-text-color);\n}\n\n.header-actions {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.nav-button[disabled] {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.body {\n  padding: 8px 16px 16px;\n  max-height: 420px;\n  overflow: auto;\n}\n\n.loading,\n.error,\n.empty {\n  padding: 16px 0;\n  color: var(--secondary-text-color);\n  text-align: center;\n}\n\n.error {\n  color: var(--error-color, #c62828);\n}\n\n.timeline {\n  position: relative;\n  padding: 8px 0;\n}\n\n.spine {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 72px;\n  width: 12px;\n  background: var(--primary-color);\n  border-radius: 999px;\n}\n\n.timeline.trim-spine-top .spine {\n  top: 36px;\n}\n\n.timeline.trim-spine-bottom .spine {\n  bottom: 36px;\n}\n\n.entry {\n  position: relative;\n  display: grid;\n  grid-template-columns: 50px 32px 1fr auto;\n  align-items: center;\n  column-gap: 12px;\n  padding: 12px 0;\n}\n\n.left-icon {\n  display: flex;\n  justify-content: flex-end;\n  padding-right: 4px;\n}\n\n.icon-ring {\n  width: 32px;\n  height: 32px;\n  border-radius: 50%;\n  background: var(--card-background-color, #fff);\n  border: 3px solid var(--primary-color);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: 0 0 0 4px var(--card-background-color, #fff);\n}\n\n.line-slot {\n  position: relative;\n  width: 32px;\n  height: 32px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.line-dot {\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background: color-mix(in srgb, white 45%, transparent);\n}\n\n.stay-icon {\n  color: var(--primary-color);\n}\n\n.move-icon {\n  color: var(--secondary-text-color);\n}\n\n.content {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.content.location {\n  align-items: flex-start;\n}\n\n.content.location.travel {\n  flex-direction: row;\n  align-items: center;\n  gap: 6px;\n  color: var(--secondary-text-color);\n}\n\n.content.time {\n  justify-self: end;\n  text-align: right;\n}\n\n.entry.move .title {\n  margin-left: 10px;\n  color: var(--secondary-text-color);\n}\n\n.entry.stay .title{\n  background-color: #0001;\n  padding: 3px 10px;\n  border-radius: 20px;\n}\n\n.title {\n  font-size: 0.95rem;\n  font-weight: 600;\n  color: var(--primary-text-color);\n}\n\n.meta {\n  font-size: 0.85rem;\n  color: var(--secondary-text-color);\n  font-weight: normal;\n}\n\n.debug {\n  margin-top: 8px;\n  padding: 8px;\n  font-size: 0.75rem;\n  color: var(--secondary-text-color);\n  background: var(--secondary-background-color);\n  border-radius: 8px;\n}\n\n#overview-map {\n  height: 200px;\n}\n\n.stay-marker{\n  height: 18px; width: 18px; background-color: var(--accent-color); border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, var(--primary-color))\n}\n";

function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDate(date) {
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

function formatTime(date) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    } catch {
        return date.toLocaleTimeString();
    }
}

function formatTimeRange(start, end) {
    return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
}

function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "0 m";
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

function haversineMeters(a, b) {
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

function toLatLon(point) {
    return {lat: point.point[0], lon: point.point[1]}
}

async function fetchHistory(hass, entityId, date) {
    const states = await fetchEntityHistory(hass, entityId, date);
    return states
        .map((state) => toPoint(state));
}

async function fetchEntityHistory(hass, entityId, date) {
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

    const response = await callWS(hass, message);
    const states = extractEntityStates(response, entityId);
    return states.map((state) => normalizeState(state)).filter(Boolean);
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
    if (!response) return [];
    if (!Array.isArray(response) && typeof response === "object") {
        const list = response[entityId];
        return Array.isArray(list) ? list : [];
    }
    if (!Array.isArray(response)) return [];
    if (response.length === 0) return [];
    if (Array.isArray(response[0])) {
        return response[0] || [];
    }
    return response.filter((state) => state.entity_id === entityId);
}

function normalizeState(state) {
    if (!state) return null;
    const attrs = state.attributes || state.a || {};
    const tsValue = state.last_changed || state.last_updated || state.created || state.timestamp || state.lu;
    const ts = tsValue ? new Date(tsValue * 1000 || tsValue) : new Date();
    return {
        state: state.state ?? state.s ?? null,
        attributes: attrs,
        ts,
    };
}

function toPoint(state) {
    const attrs = state.attributes || {};
    let lat = Number(attrs.latitude);
    let lon = Number(attrs.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        const gps = Array.isArray(attrs.gps) ? attrs.gps : null;
        if (gps && gps.length >= 2) {
            lat = Number(gps[0]);
            lon = Number(gps[1]);
        }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
        point: [lat, lon],
        timestamp: state.ts,
    };
}

function segmentTimeline(points, options, zones) {
    if (!Array.isArray(points) || points.length === 0) return [];
    const stayRadius = Math.max(10, options.stayRadiusM || 75);
    const minStayMs = Math.max(1, options.minStayMinutes || 10) * 60000;

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    const stays = detectStays(sorted, stayRadius, minStayMs);

    const segments = [];
    let cursor = 0;
    stays.forEach((stay) => {
        if (cursor < stay.startIndex) {
            const move = buildMoveSegment(sorted.slice(cursor, stay.startIndex + 1));
            if (move) segments.push(move);
        }
        segments.push(buildStaySegment(stay, zones));
        cursor = stay.endIndex + 1;
    });

    if (cursor < sorted.length) {
        const move = buildMoveSegment(sorted.slice(cursor));
        if (move) segments.push(move);
    }

    return segments;
}

function detectStays(points, stayRadius, minStayMs) {
    const stays = [];
    let i = 0;

    while (i < points.length - 1) {
        const cluster = [toLatLon(points[i])];
        let center = toLatLon(points[i]);
        let lastInIndex = i;
        let outlierUsed = false;

        for (let j = i + 1; j < points.length; j += 1) {
            const candidate = toLatLon(points[j]);
            const distance = haversineMeters(center, candidate);
            if (distance <= stayRadius) {
                cluster.push(candidate);
                center = meanCenter(cluster);
                lastInIndex = j;
                outlierUsed = false;
                continue;
            }

            if (!outlierUsed && distance <= stayRadius * 2) {
                outlierUsed = true;
                continue;
            }

            break;
        }

        const duration = points[lastInIndex].timestamp - points[i].timestamp;
        if (duration >= minStayMs) {
            const radius = maxDistance(center, cluster);
            stays.push({
                startIndex: i,
                endIndex: lastInIndex,
                start: points[i].timestamp,
                end: points[lastInIndex].timestamp,
                center,
                radius,
            });
            i = lastInIndex + 1;
        } else {
            i += 1;
        }
    }

    return stays;
}

function meanCenter(cluster) {
    const sum = cluster.reduce(
        (acc, point) => {
            acc.lat += point.lat;
            acc.lon += point.lon;
            return acc;
        },
        {lat: 0, lon: 0}
    );
    return {
        lat: sum.lat / cluster.length,
        lon: sum.lon / cluster.length,
    };
}

function maxDistance(center, cluster) {
    let max = 0;
    for (const point of cluster) {
        const distance = haversineMeters(center, point);
        if (distance > max) max = distance;
    }
    return max;
}

function buildStaySegment(stay, zones) {
    const zone = resolveZone(stay.center, zones);
    return {
        type: "stay",
        start: stay.start,
        end: stay.end,
        durationMs: stay.end - stay.start,
        center: stay.center,
        radius: stay.radius,
        zoneName: zone ? zone.name : null,
        zoneIcon: zone ? zone.icon : null,
    };
}

function buildMoveSegment(points) {
    if (!points || points.length < 2) return null;
    let distance = 0;
    for (let i = 1; i < points.length; i += 1) {
        distance += haversineMeters(toLatLon(points[i - 1]), toLatLon(points[i]));
    }
    const start = points[0].timestamp;
    const end = points[points.length - 1].timestamp;
    return {
        type: "move",
        start,
        end,
        durationMs: end - start,
        distanceM: distance,
    };
}

function resolveZone(center, zones) {
    if (!Array.isArray(zones)) return null;
    let match = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
        const distance = haversineMeters(center, zone);
        if (distance <= zone.radius && distance < bestDistance) {
            match = zone;
            bestDistance = distance;
        }
    }
    return match;
}

function renderTimeline(segments) {
    if (!segments || segments.length === 0) {
        return `<div class="empty">No location history for this day.</div>`;
    }

    const firstIsStay = segments[0]?.type === "stay";
    const lastIsStay = segments[segments.length - 1]?.type === "stay";
    const timelineClass = [
        "timeline",
        firstIsStay ? "trim-spine-top" : "",
        lastIsStay ? "trim-spine-bottom" : "",
    ].filter(Boolean).join(" ");

    return `
    <div class="${timelineClass}">
      <div class="spine"></div>
      ${segments.map((segment, index) => renderSegment(segment, index, {
          hideStart: index === 0 && firstIsStay,
          hideEnd: index === segments.length - 1 && lastIsStay,
      })).join("")}
    </div>
  `;
}

function renderSegment(segment, index, {hideStart = false, hideEnd = false} = {}) {
    if (segment.type === "stay") {
        return `
      <div class="entry stay" data-segment-index="${index}" data-segment-type="stay">
        <div class="left-icon">
          <div class="icon-ring">
            <ha-icon class="stay-icon" icon="${segment.zoneIcon || "mdi:map-marker"}"></ha-icon>
          </div>
        </div>
        <div class="line-slot">
          <div class="line-dot"></div>
        </div>
        <div class="content location">
          <div class="title">${escapeHtml(segment.zoneName || segment.placeName || "Unknown location")}</div>
        </div>
        <div class="content time">
          <div class="meta">${formatStayTime(segment.start, segment.end, {hideStart, hideEnd})}</div>
        </div>
      </div>
    `;
    }

    return `
    <div class="entry move" data-segment-index="${index}" data-segment-type="move">
      <div class="left-icon"></div>
      <div class="line-slot"></div>
      <div class="content location travel">
        <ha-icon class="move-icon" icon="mdi:chart-line-variant"></ha-icon>
        <div class="title">Moving<span class="meta"> - ${formatDistance(segment.distanceM)}</span></div>
      </div>
      <div class="content time">
        <div class="meta">${formatDuration(segment.durationMs)}</div>
      </div>
    </div>
  `;
}

function formatStayTime(start, end, {hideStart = false, hideEnd = false} = {}) {
    if (hideStart && !hideEnd) {
        return formatTime(end);
    }

    if (hideEnd && !hideStart) {
        return formatTime(start);
    }

    return formatTimeRange(start, end);
}

function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

const OPTIONS = {
    places_entity: null,
    stay_radius_m: 75,
    min_stay_minutes: 10,
    show_debug: false,
};

class TimelineCardEditor extends HTMLElement {
    setConfig(config) {
        this._config = {...OPTIONS, ...config};
        this._render();
    }

    set hass(hass) {
        this._hass = hass;
        this._render();
    }

    _render() {
        if (!this._config || !this._hass) return;
        if (!this.shadowRoot) {
            this.attachShadow({mode: "open"});
        }

        this.shadowRoot.innerHTML = "";

        const style = document.createElement("style");
        style.textContent = `
      :host { display: block; }
      .form { display: grid; gap: 12px; }
      ha-textfield { display: block; }
    `;
        this.shadowRoot.appendChild(style);

        const form = document.createElement("div");
        form.className = "form";

        const entityPicker = document.createElement("ha-entity-picker");
        entityPicker.setAttribute("label", "Tracked entity");
        entityPicker.hass = this._hass;
        entityPicker.value = this._config.entity || "";
        entityPicker.includeDomains = ["device_tracker", "person"];
        entityPicker.addEventListener("value-changed", this._onEntityChanged.bind(this));

        const stayRadius = document.createElement("ha-textfield");
        stayRadius.setAttribute("label", "Stay radius (meters)");
        stayRadius.setAttribute("type", "number");
        stayRadius.setAttribute("min", "10");
        stayRadius.setAttribute("step", "5");
        stayRadius.value = String(this._config.stay_radius_m ?? OPTIONS.stay_radius_m);
        stayRadius.addEventListener("input", (ev) => this._onNumberChanged("stay_radius_m", ev));

        const minStay = document.createElement("ha-textfield");
        minStay.setAttribute("label", "Minimum stay duration (minutes)");
        minStay.setAttribute("type", "number");
        minStay.setAttribute("min", "1");
        minStay.setAttribute("step", "1");
        minStay.value = String(this._config.min_stay_minutes ?? OPTIONS.min_stay_minutes);
        minStay.addEventListener("input", (ev) => this._onNumberChanged("min_stay_minutes", ev));

        const placesPicker = document.createElement("ha-entity-picker");
        placesPicker.setAttribute("label", "Places entity (optional)");
        placesPicker.hass = this._hass;
        placesPicker.value = this._config.places_entity || "";
        placesPicker.includeDomains = ["sensor"];
        placesPicker.addEventListener("value-changed", (ev) => this._onEntityFieldChanged("places_entity", ev));

        const debugRow = document.createElement("label");
        debugRow.style.display = "flex";
        debugRow.style.alignItems = "center";
        debugRow.style.justifyContent = "space-between";
        debugRow.style.gap = "12px";
        debugRow.textContent = "Show debug";

        const debugToggle = document.createElement("ha-switch");
        debugToggle.checked = Boolean(this._config.show_debug ?? OPTIONS.show_debug);
        debugToggle.addEventListener("change", (ev) => this._onToggleChanged("show_debug", ev));
        debugRow.appendChild(debugToggle);

        form.appendChild(entityPicker);
        form.appendChild(placesPicker);
        form.appendChild(stayRadius);
        form.appendChild(minStay);
        form.appendChild(debugRow);
        this.shadowRoot.appendChild(form);
    }

    _onEntityChanged(ev) {
        const value = ev?.detail?.value || "";
        this._config = {...this._config, entity: value};
        this._emitChange();
    }

    _onEntityFieldChanged(key, ev) {
        const value = ev?.detail?.value || "";
        this._config = {...this._config, [key]: value || null};
        this._emitChange();
    }

    _onNumberChanged(key, ev) {
        const value = Number(ev.target.value);
        if (!Number.isFinite(value)) return;
        this._config = {...this._config, [key]: value};
        this._emitChange();
    }

    _onToggleChanged(key, ev) {
        this._config = {...this._config, [key]: Boolean(ev.target.checked)};
        this._emitChange();
    }

    _emitChange() {
        this.dispatchEvent(
            new CustomEvent("config-changed", {
                detail: {config: this._config},
                bubbles: true,
                composed: true,
            })
        );
    }
}

customElements.define("timeline-card-editor", TimelineCardEditor);

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
        this._loading = false;
        this._error = null;
        this._rendered = false;
        this._fullDayPaths = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

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

        const nextButton = this.shadowRoot.querySelector("[data-action='next']");
        nextButton.toggleAttribute("disabled", isFuture);

        const body = this.shadowRoot.getElementById("timeline-body");
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
              <div id="overview-map"></div>
              <div class="header my-header">
                <ha-icon-button class="nav-button" data-action="prev" label="Previous day"><ha-icon icon="mdi:chevron-left"></ha-icon></ha-icon-button>
                <div id="timeline-date" class="date"></div>
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
        this._fullDayPaths = points.length > 1
            ? [{
                points: points,
                color: "var(--primary-color)",
                weight: 4,
                gradualOpacity: 0.2,
            }]
            : [];

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        this._drawMapPaths();
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
            haIcon.setAttribute("style", "color: white; --mdc-icon-size: 18px;");

            let iconDiv = document.createElement("div");
            iconDiv.appendChild(haIcon);
            iconDiv.setAttribute("style", "height: 18px; width: 18px; background-color: var(--primary-color); " +
                "border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, var(--primary-color))");

            let icon = Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [22, 22]});
            haMap._mapPaths.push(Leaflet.marker(stay.center, {icon}));
        });

        if (this._highlightedStay) {
            let haIcon = document.createElement("ha-icon");
            haIcon.setAttribute("icon", this._highlightedStay.zoneIcon || "mdi:map-marker");
            haIcon.setAttribute("style", "color: white; --mdc-icon-size: 22px;");

            let iconDiv = document.createElement("div");
            iconDiv.appendChild(haIcon);
            iconDiv.setAttribute("style", "height: 22px; width: 22px; background-color: var(--accent-color); " +
                "border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, var(--accent-color))");

            let icon = Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [26, 26]});
            haMap._mapPaths.push(Leaflet.marker(this._highlightedStay.center, {icon}));

        }
    }

    _drawMapLines(haMap, Leaflet) {
        const basePaths = this._fullDayPaths.map((path) => ({
            ...path,
            gradualOpacity: this._isTravelHighlightActive ? 0.8 : path.gradualOpacity,
        }));
        const paths = [
            ...basePaths,
            ...this._highlightedPath
        ];

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

    _fitMap(defer, bounds, pad = 0.1) {
        const haMap = this._mapCard?.shadowRoot?.querySelector("ha-map");
        const Leaflet = haMap?.Leaflet;
        if (!haMap || !Leaflet) return;
        if (bounds === undefined) {
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

        if (segment.type === "stay") {
            this._highlightedStay = segment;
            this._drawMapPaths();
        } else if (segment.type === "move") {
            const segmentPoints = this._extractSegmentPoints(dayData.points, segment);
            if (segmentPoints.length < 2) {
                this._drawMapPaths();
                return;
            }

            this._highlightedPath = [{
                points: segmentPoints,
                color: "var(--accent-color)",
                weight: 7,
                opacity: 1,
                gradualOpacity: 0,
            }];
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
        this._drawMapPaths();
    }

    _handleSegmentClick(segmentIndex) {
        if (!Number.isInteger(segmentIndex)) return;
        const dayData = this._getCurrentDayData();
        if (!dayData || !Array.isArray(dayData.segments)) return;

        const segment = dayData.segments[segmentIndex];
        if (!segment) return;

        if (segment.type === "stay") {
            this._fitMap(false, [segment.center]);
        } else if (segment.type === "move") {
            this._fitMap(false, this._highlightedPath[0].points.map(toLatLon));
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

function getConfigElement() {
    return document.createElement("timeline-card-editor");
}

function getStubConfig() {
    return {
        entity: "device_tracker.your_device",
        places_entity: null,
        stay_radius_m: 75,
        min_stay_minutes: 10,
        show_debug: false,
    };
}

export { getConfigElement, getStubConfig };
