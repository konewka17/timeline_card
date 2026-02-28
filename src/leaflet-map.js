import Leaflet from "leaflet";
import {getTrackColor} from "./utils.js";

const DEFAULT_CENTER = [52.3731339, 4.8903147];
const DEFAULT_ZOOM = 13;

export class TimelineLeafletMap {
    constructor(mapElement) {
        if (!mapElement?.isConnected) {
            throw new Error("Cannot setup Leaflet map on disconnected element");
        }

        this._Leaflet = Leaflet;
        this._mapElement = mapElement;
        this._leafletMap = Leaflet.map(mapElement, {zoomControl: true,});

        const attribution = "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>, &copy; <a href=\"https://carto.com/attributions\">CARTO</a>";
        const tileLayer = Leaflet.tileLayer(`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`, {
            attribution, subdomains: "abcd", minZoom: 0, maxZoom: 20
        });
        tileLayer.addTo(this._leafletMap);
        this._leafletMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        this._mapLayers = [];
        this._fullDayPaths = [];
        this._fullDayPath = [];
        this._currentLocations = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._isMapZoomedToSegment = false;

        this.setDarkMode(false);
        requestAnimationFrame(() => this._leafletMap.invalidateSize());
    }

    setDarkMode(isDarkMode) {
        this._mapElement?.classList.toggle("dark", Boolean(isDarkMode));
    }

    destroy() {
        this._leafletMap.remove();
        this._mapLayers = [];
        this._fullDayPath = [];
        this._fullDayPaths = [];
        this._currentLocations = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
    }

    get isMapZoomedToSegment() {
        return this._isMapZoomedToSegment;
    }

    setDaySegments(tracks = [], activeEntityIndex = 0, onTrackClick = null, colors = []) {
        this._fullDayPaths = tracks.map((track, index) => {
            const points = [];
            const segments = Array.isArray(track?.segments) ? track.segments : [];
            segments.forEach((segment) => {
                if (segment?.type === "stay" && segment.center) {
                    points.push({point: [segment.center.lat, segment.center.lon], timestamp: segment.start});
                }
                if (segment?.type === "move" && Array.isArray(segment.points)) {
                    points.push(...segment.points);
                }
            });

            return {
                entityIndex: index, isActive: index === activeEntityIndex, points, color: getTrackColor(index, colors),
                opacity: index === activeEntityIndex ? 1 : 0.8, weight: 4, borderWeight: 7,
            };
        });

        this._fullDayPath = this._fullDayPaths[activeEntityIndex] || {points: []};
        this._activeTrackColor = this._fullDayPaths[activeEntityIndex]?.color || "var(--primary-color)";
        this._onTrackClick = typeof onTrackClick === "function" ? onTrackClick : null;

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._isMapZoomedToSegment = false;

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
            this._highlightedPath = [{
                points: segment.points, color: "var(--accent-color)", weight: 7, opacity: 1, borderWeight: 10
            }];
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

    resetMapZoom() {
        this._isMapZoomedToSegment = false;
        this.fitMap();
    }

    zoomToStay(stay) {
        if (!stay?.center) return;
        this._isMapZoomedToSegment = true;
        this.fitMap([stay.center]);
    }

    zoomToPoints(points) {
        if (!Array.isArray(points) || points.length < 2) return;
        this._isMapZoomedToSegment = true;
        this.fitMap(points);
    }

    setCurrentLocations(currentLocations = []) {
        this._currentLocations = Array.isArray(currentLocations) ? currentLocations : [];
    }

    fitMap(bounds = null) {
        if (bounds === null) {
            bounds = this._fullDayPath?.points?.map((point) => point.point) || [];
        }
        const paddedBounds = this._Leaflet.latLngBounds(bounds).pad(0.1);
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
            const icon = createMarkerIcon({
                iconName: stay.zoneIcon || "mdi:map-marker", markerSize: 18, iconSize: 14,
                backgroundColor: this._activeTrackColor,
                borderColor: `color-mix(in srgb, black 30%, ${this._activeTrackColor})`, iconPadding: "2px",
                leafletIconSize: [22, 22],
            });

            this._mapLayers.push(this._Leaflet.marker(stay.center, {icon, zIndexOffset: 100}));
        });

        if (!this._highlightedStay) return;

        const icon = createMarkerIcon({
            iconName: this._highlightedStay.zoneIcon || "mdi:map-marker", markerSize: 22, iconSize: 22,
            backgroundColor: "var(--accent-color)", borderColor: "color-mix(in srgb, black 30%, var(--accent-color))",
            leafletIconSize: [26, 26],
        });

        this._mapLayers.push(this._Leaflet.marker(this._highlightedStay.center, {icon, zIndexOffset: 1000}));
    }

    _drawMapLines() {
        const inactivePaths = this._fullDayPaths.filter((path) => !path.isActive);
        const activePaths = this._fullDayPaths.filter((path) => path.isActive);
        const paths = [...inactivePaths, ...activePaths, ...this._highlightedPath];

        paths.forEach((path) => {
            if (!Array.isArray(path.points) || path.points.length < 2) return;
            const latLngs = path.points.map((point) => point.point);

            if (path.isActive || path.entityIndex === undefined) {
                this._mapLayers.push(this._Leaflet.polyline(latLngs, {
                    color: `color-mix(in srgb, black 30%, ${path.color})`, opacity: path.opacity ?? 1,
                    weight: path.borderWeight ?? (path.weight + 3),
                }));
            }

            const line = this._Leaflet.polyline(latLngs, {
                color: path.color, opacity: path.opacity ?? 1, weight: path.weight,
            });
            line.on("click", () => {
                if (!Number.isInteger(path.entityIndex) || !this._onTrackClick) return;
                this._onTrackClick(path.entityIndex);
            });
            this._mapLayers.push(line);
        });
    }

    _drawCurrentLocationMarkers() {
        let markerGroup = Leaflet.layerGroup()
        this._currentLocations.forEach((location) => {
            if (!location?.point) return;

            const icon = location.picture
                ? createEntityPictureIcon(location.picture, location.name)
                : createDefaultCurrentLocationIcon();

            markerGroup.addLayer(this._Leaflet.marker(location.point, {icon, zIndexOffset: 1000}));
        });
        this._mapLayers.push(markerGroup);
    }
}

function createMarkerIcon(options) {
    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", options.iconName);
    haIcon.setAttribute("style", `color: white; --mdc-icon-size: ${(options.iconSize)}px; padding: ${options.iconPadding || 0}`);

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(haIcon);
    iconDiv.setAttribute("style", `height: ${(options.markerSize)}px; width: ${(options.markerSize)}px; background-color: ${(options.backgroundColor)}; border-radius: 50%; border: 2px solid ${(options.borderColor)}; display: flex;`);

    return Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: options.leafletIconSize});
}

function createEntityPictureIcon(pictureUrl, name = "") {
    const img = document.createElement("img");
    img.src = pictureUrl;
    img.alt = name;
    img.setAttribute("style", "height: 42px; width: 42px; border-radius: 50%; object-fit: cover;");

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(img);
    iconDiv.setAttribute("style", "height: 42px; width: 42px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px #0005; overflow: hidden; background: white;");

    return Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [42, 42]});
}

function createDefaultCurrentLocationIcon() {
    const innerDot = document.createElement("div");
    innerDot.setAttribute("style", "height: 14px; width: 14px; border-radius: 50%; background: #1a73e8; border: 3px solid white; box-shadow: 0 1px 6px #0006;");

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(innerDot);
    iconDiv.setAttribute("style", "height: 20px; width: 20px; display: flex; align-items: center; justify-content: center;");

    return Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: [20, 20]});
}
