import Leaflet from "leaflet";
import {maplibreGL} from "@maplibre/maplibre-gl-leaflet";
import {getTrackColor} from "./utils.js";

const DEFAULT_ZOOM = 13;
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 20;

// Shortbread vector tiles from the OpenStreetMap Foundation, through the style,
// glyphs and sprites the Home Assistant frontend serves itself (2026.9 and up).
// Older installs have no /static/map, so the raster layer stays as a fallback.
const VECTOR_STYLES = {
    light: "/static/map/light.json",
    dark: "/static/map/dark.json",
};

// Fallback only: CARTO watermarks tiles requested without an API key and is
// retiring this service, so `map_tile_url` exists to point somewhere else (or at
// the same URL with `?key=...` appended).
const RASTER_TILE_URL = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION}, &copy; <a href="https://carto.com/attributions">CARTO</a>`;

// A backgrounded tab also drops the WebGL context, and that one comes back, so
// only a loss that outlives the grace period falls back to raster tiles.
const CONTEXT_RESTORE_GRACE = 2000;

let webGL2Supported;

function supportsWebGL2() {
    if (webGL2Supported === undefined) {
        try {
            const context = document.createElement("canvas").getContext("webgl2");
            webGL2Supported = Boolean(context);
            // Contexts are scarce, so the probe must not hold on to one.
            context?.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
            webGL2Supported = false;
        }
    }
    return webGL2Supported;
}

// MapLibre rejects a relative sprite URL, while the glyph URL must be left alone:
// encoding it would mangle its {fontstack} and {range} placeholders.
async function loadMapStyle(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Map style ${url} unavailable (${response.status})`);
    const style = await response.json();
    if (typeof style.sprite === "string") {
        style.sprite = new URL(style.sprite, location.href).href;
    } else if (Array.isArray(style.sprite)) {
        style.sprite = style.sprite.map((sprite) => ({...sprite, url: new URL(sprite.url, location.href).href}));
    }
    return style;
}

export class TimelineLeafletMap {
    constructor(mapElement, homeZoneCenter = null, options = {}) {
        if (!mapElement?.isConnected) {
            throw new Error("Cannot setup Leaflet map on disconnected element");
        }

        this._Leaflet = Leaflet;
        this._mapElement = mapElement;
        this._homeZoneCenter = homeZoneCenter;
        this._leafletMap = Leaflet.map(mapElement, {zoomControl: true, minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM});

        this._rasterTileUrl = options.mapTileUrl || RASTER_TILE_URL;
        this._rasterAttribution = options.mapAttribution
            || (options.mapTileUrl ? OSM_ATTRIBUTION : CARTO_ATTRIBUTION);
        this._vectorLayer = null;
        this._destroyed = false;
        this._darkMode = false;
        this._styleRequest = 0;
        this._appliedDarkMode = false;
        this._contextLost = false;
        this._fallbackTimeout = undefined;
        this._handleVisibilityChange = () => {
            if (this._contextLost) this._scheduleRasterFallback();
        };
        // Deferred so the caller's setDarkMode() lands before the style is picked.
        Promise.resolve().then(() => this._setupBaseLayer());

        if (this._homeZoneCenter) this._leafletMap.setView(this._homeZoneCenter, DEFAULT_ZOOM);

        this._mapLayers = [];
        this._fullDayPaths = [];
        this._fullDayPath = [];
        this._currentLocations = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        this.setDarkMode(false);
        requestAnimationFrame(() => this._leafletMap.invalidateSize());
    }

    async _setupBaseLayer() {
        if (this._destroyed) return;
        if (supportsWebGL2() && (await this._createVectorLayer())) return;
        this._createRasterLayer();
    }

    async _createVectorLayer() {
        let layer;
        try {
            const style = await loadMapStyle(VECTOR_STYLES[this._darkMode ? "dark" : "light"]);
            if (this._destroyed) return false;
            layer = maplibreGL({style, localIdeographFontFamily: "sans-serif"});
            // The adapter builds the MapLibre map in `onAdd`, so a refused context or a
            // blocked worker throws here — inside the guard, or raster is never reached.
            layer.addTo(this._leafletMap);
        } catch {
            try {
                layer?.remove();
            } catch {
                // May never have finished being added.
            }
            return false;
        }

        this._vectorLayer = layer;
        this._appliedDarkMode = this._darkMode;
        this._mapElement?.classList.remove("raster-tiles");

        const glMap = layer.getMaplibreMap();
        glMap.on("webglcontextlost", () => {
            this._contextLost = true;
            this._scheduleRasterFallback();
        });
        glMap.on("webglcontextrestored", () => {
            this._contextLost = false;
            clearTimeout(this._fallbackTimeout);
        });
        document.addEventListener("visibilitychange", this._handleVisibilityChange);
        return true;
    }

    _createRasterLayer() {
        if (this._destroyed) return;
        this._mapElement?.classList.add("raster-tiles");
        Leaflet.tileLayer(this._rasterTileUrl, {
            attribution: this._rasterAttribution,
            subdomains: "abcd",
            minZoom: MAP_MIN_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            referrerPolicy: "no-referrer-when-downgrade",
        }).addTo(this._leafletMap);
    }

    _scheduleRasterFallback() {
        clearTimeout(this._fallbackTimeout);
        if (!this._vectorLayer || document.hidden) return;
        this._fallbackTimeout = setTimeout(() => this._swapToRaster(), CONTEXT_RESTORE_GRACE);
    }

    _swapToRaster() {
        const layer = this._vectorLayer;
        this._vectorLayer = null;
        document.removeEventListener("visibilitychange", this._handleVisibilityChange);
        try {
            layer?.remove();
        } catch {
            // Nothing left to detach.
        }
        this._createRasterLayer();
        // The raster layer has no dark variant; the CSS filter takes over again.
        this._mapElement?.classList.toggle("dark", this._darkMode);
    }

    setDarkMode(isDarkMode) {
        const darkMode = Boolean(isDarkMode);
        this._darkMode = darkMode;
        this._mapElement?.classList.toggle("dark", darkMode);
        if (!this._vectorLayer || darkMode === this._appliedDarkMode) return;

        // Styles are fetched, so only the newest request may touch the map.
        const request = ++this._styleRequest;
        loadMapStyle(VECTOR_STYLES[darkMode ? "dark" : "light"])
            .then((style) => {
                if (request !== this._styleRequest || !this._vectorLayer) return;
                this._appliedDarkMode = darkMode;
                this._vectorLayer.getMaplibreMap()?.setStyle(style);
            })
            .catch(() => {
                // Keep showing the style that is up; the next toggle retries.
            });
    }

    destroy() {
        this._destroyed = true;
        clearTimeout(this._fallbackTimeout);
        document.removeEventListener("visibilitychange", this._handleVisibilityChange);
        this._vectorLayer = null;
        this._leafletMap.remove();
        this._mapLayers = [];
        this._fullDayPath = [];
        this._fullDayPaths = [];
        this._currentLocations = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
    }

    setDaySegments(tracks = [], activeEntityIndex = 0, onTrackClick = null, colors = [], hideUnselected = false) {
        this._fullDayPaths = tracks
            .map((track, index) => {
                const points = [];
                const segments = Array.isArray(track?.segments) ? track.segments : [];
                segments.forEach((segment) => {
                    if (segment?.type === "stay" && segment.center) {
                        points.push({
                            point: [segment.center.lat, segment.center.lon],
                            timestamp: segment.start,
                        });
                    }
                    if (segment?.type === "move" && Array.isArray(segment.points)) {
                        points.push(...segment.points);
                    }
                });

                return {
                    entityIndex: index,
                    isActive: index === activeEntityIndex,
                    points,
                    color: getTrackColor(index, colors),
                    opacity: index === activeEntityIndex ? 1 : 0.8,
                    weight: 4,
                    borderWeight: 7,
                };
            })
            .filter((path) => !hideUnselected || path.isActive);

        const activeTrackPath = this._fullDayPaths.find((path) => path.isActive);
        this._fullDayPath = activeTrackPath || {points: []};
        this._activeTrackColor = activeTrackPath?.color || "var(--primary-color)";
        this._onTrackClick = typeof onTrackClick === "function" ? onTrackClick : null;

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        const activeSegments = tracks[activeEntityIndex]?.segments || [];
        this._drawMapSegments(activeSegments);
    }

    highlightSegment(segment, segments) {
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        if (segment?.type === "stay") {
            this._highlightedStay = segment;
        } else if (segment?.type === "move") {
            this._highlightedPath = [
                {
                    points: segment.points,
                    color: "var(--accent-color)",
                    weight: 7,
                    opacity: 1,
                    borderWeight: 10,
                },
            ];
            this._isTravelHighlightActive = true;
        }

        this._drawMapSegments(segments);
    }

    clearHighlight(segments) {
        if (!this._highlightedPath.length && !this._highlightedStay && !this._isTravelHighlightActive) {
            return;
        }

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        this._drawMapSegments(segments);
    }

    fitMap(bounds = null) {
        if (bounds === null) {
            bounds = this._fullDayPath?.points?.map((point) => point.point) || [];
        }
        if (!bounds.length) {
            if (this._homeZoneCenter) this._leafletMap.setView(this._homeZoneCenter, DEFAULT_ZOOM);
            return;
        }
        const normalizedBounds = bounds
            .map(normalizeLatLng)
            .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
        if (!normalizedBounds.length) return;
        const paddedBounds = this._Leaflet.latLngBounds(normalizedBounds).pad(0.1);
        this._leafletMap.fitBounds(paddedBounds, {maxZoom: 14});
    }

    _drawMapSegments(segments) {
        this._mapLayers.forEach((layer) => layer.remove());
        this._mapLayers = [];

        this._drawMapLines();
        this._drawMapMarkers(segments);
        this._drawCurrentLocationMarkers();
        this._mapLayers.forEach((layer) => this._leafletMap.addLayer(layer));
    }

    _drawMapMarkers(segments) {
        const stayMarkers = Array.isArray(segments) ? segments.filter((segment) => segment?.type === "stay") : [];

        stayMarkers.forEach((stay) => {
            const iconName = stay.zoneIcon || "mdi:map-marker";
            const icon = createMarkerIcon({
                iconName: iconName,
                markerSize: 18,
                iconSize: 14,
                backgroundColor: this._activeTrackColor,
                borderColor: `color-mix(in srgb, black 30%, ${this._activeTrackColor})`,
                iconPadding: "2px",
                leafletIconSize: [22, 22],
            });

            this._mapLayers.push(this._Leaflet.marker(stay.center, {icon, zIndexOffset: 100}));
        });

        if (!this._highlightedStay) return;

        const iconName = this._highlightedStay.zoneIcon || "mdi:map-marker";
        const icon = createMarkerIcon({
            iconName: iconName,
            markerSize: 22,
            iconSize: 22,
            backgroundColor: "var(--accent-color)",
            borderColor: "color-mix(in srgb, black 30%, var(--accent-color))",
            leafletIconSize: [26, 26],
        });

        this._mapLayers.push(
            this._Leaflet.marker(this._highlightedStay.center, {
                icon,
                zIndexOffset: 1000,
            }),
        );
    }

    _drawMapLines() {
        const inactivePaths = this._fullDayPaths.filter((path) => !path.isActive);
        const activePaths = this._fullDayPaths.filter((path) => path.isActive);
        const paths = [...inactivePaths, ...activePaths, ...this._highlightedPath];

        paths.forEach((path) => {
            if (!Array.isArray(path.points) || path.points.length < 2) return;
            const latLngs = path.points.map((point) => point.point);

            if (path.isActive || path.entityIndex === undefined) {
                this._mapLayers.push(
                    this._Leaflet.polyline(latLngs, {
                        color: `color-mix(in srgb, black 30%, ${path.color})`,
                        opacity: path.opacity ?? 1,
                        weight: path.borderWeight ?? path.weight + 3,
                    }),
                );
            }

            const line = this._Leaflet.polyline(latLngs, {
                color: path.color,
                opacity: path.opacity ?? 1,
                weight: path.weight,
            });
            line.on("click", () => {
                if (!Number.isInteger(path.entityIndex) || !this._onTrackClick) return;
                this._onTrackClick(path.entityIndex);
            });
            this._mapLayers.push(line);
        });
    }

    _drawCurrentLocationMarkers() {
        let markerGroup = Leaflet.layerGroup();
        if (this._currentLocations.length === 1) {
            markerGroup.addLayer(
                this._Leaflet.marker(this._currentLocations[0].point, {
                    icon: createDefaultCurrentLocationIcon(),
                    zIndexOffset: 1000,
                }),
            );
        } else {
            this._currentLocations.forEach((location, index) => {
                if (!location?.point) return;
                const icon = createEntityIcon(location);
                const zIndexOffset = location.isActive ? 1500 : 1000;
                markerGroup.addLayer(
                    this._Leaflet.marker(location.point, {
                        icon,
                        zIndexOffset: zIndexOffset,
                    }),
                );
            });
        }
        this._mapLayers.push(markerGroup);
    }
}

function createMarkerIcon(options) {
    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", options.iconName);
    haIcon.setAttribute(
        "style",
        `color: white; --mdc-icon-size: ${options.iconSize}px; padding: ${options.iconPadding || 0}`,
    );

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(haIcon);
    iconDiv.setAttribute(
        "style",
        `height: ${options.markerSize}px; width: ${options.markerSize}px; background-color: ${options.backgroundColor}; border-radius: 50%; border: 2px solid ${options.borderColor}; display: flex;`,
    );

    return Leaflet.divIcon({
        html: iconDiv,
        className: "my-leaflet-icon",
        iconSize: options.leafletIconSize,
    });
}

function createEntityIcon(location) {
    let icon;
    if (location.picture) {
        icon = document.createElement("img");
        icon.src = location.picture;
        icon.alt = location.name;
        icon.setAttribute("style", "height: 42px; width: 42px; border-radius: 50%; object-fit: cover;");
    } else if (location.icon) {
        icon = document.createElement("ha-icon");
        icon.setAttribute("icon", location.icon);
        icon.setAttribute(
            "style",
            "height: 42px; width: 42px; display: flex; align-items: center; justify-content: center; color: white; --mdc-icon-size: 26px;",
        );
    } else {
        const getAbbreviation = (name) => {
            const words = name.split(" ");
            if (words.length === 1) {
                return words[0].charAt(0).toUpperCase() + words[0].charAt(1);
            }
            return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
        };
        icon = document.createElement("div");
        icon.innerHTML = getAbbreviation(location.name);
        icon.setAttribute(
            "style",
            `height: 42px; width: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5em; font-weight: bold; color: white;`,
        );
    }
    const iconDiv = document.createElement("div");
    iconDiv.appendChild(icon);
    iconDiv.setAttribute(
        "style",
        `height: 42px; width: 42px; border-radius: 50%; border: 3px solid color-mix(in srgb, black 30%, ${location.color}); overflow: hidden; background-color: ${location.color}`,
    );

    return Leaflet.divIcon({
        html: iconDiv,
        className: "my-leaflet-icon",
        iconSize: [48, 48],
    });
}

function createDefaultCurrentLocationIcon() {
    const innerDot = document.createElement("div");
    innerDot.setAttribute(
        "style",
        "height: 14px; width: 14px; border-radius: 50%; background: #1a73e8; border: 3px solid white; box-shadow: 0 1px 6px #0006;",
    );

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(innerDot);
    iconDiv.setAttribute(
        "style",
        "height: 20px; width: 20px; display: flex; align-items: center; justify-content: center;",
    );

    return Leaflet.divIcon({
        html: iconDiv,
        className: "my-leaflet-icon",
        iconSize: [20, 20],
    });
}

function normalizeLatLng(point) {
    if (Array.isArray(point) && point.length >= 2) {
        return {lat: Number(point[0]), lng: Number(point[1])};
    }
    if (!point || typeof point !== "object") return null;
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        return {lat: Number(point.lat), lng: Number(point.lng)};
    }
    if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        return {lat: Number(point.lat), lng: Number(point.lon)};
    }
    return null;
}
