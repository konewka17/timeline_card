import Leaflet from "leaflet";

const DEFAULT_CENTER = [52.3731339, 4.8903147];
const DEFAULT_ZOOM = 13;

export class TimelineLeafletMap {
    constructor(mapElement) {
        if (!mapElement?.isConnected) {
            throw new Error("Cannot setup Leaflet map on disconnected element");
        }

        this._Leaflet = Leaflet;
        this._leafletMap = Leaflet.map(mapElement, {
            zoomControl: true,
        });

        this._tileLayer = createTileLayer(Leaflet).addTo(this._leafletMap);
        this._leafletMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        this._mapLayers = [];
        this._fullDayPaths = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._isMapZoomedToSegment = false;

        requestAnimationFrame(() => this._leafletMap.invalidateSize());
    }

    destroy() {
        this._leafletMap.remove();
        this._mapLayers = [];
        this._fullDayPaths = [];
        this._highlightedPath = [];
        this._highlightedStay = null;
    }

    get isMapZoomedToSegment() {
        return this._isMapZoomedToSegment;
    }

    setDaySegments(segments) {
        this._fullDayPaths = [];
        if (Array.isArray(segments) && segments.length > 1) {
            this._fullDayPaths = segments
                .filter((segment) => segment?.type === "move")
                .map((segment) => ({points: segment.points, color: "var(--primary-color)", weight: 4}));
        }

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;
        this._isMapZoomedToSegment = false;

        this._drawMapPaths(segments);
    }

    highlightSegment(segment, segments) {
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        if (segment?.type === "stay") {
            this._highlightedStay = segment;
        } else if (segment?.type === "move") {
            this._highlightedPath = [{points: segment.points, color: "var(--accent-color)", weight: 7}];
            this._isTravelHighlightActive = true;
        }

        this._drawMapPaths(segments);
    }

    clearHighlight(segments) {
        if (!this._highlightedPath.length && !this._highlightedStay && !this._isTravelHighlightActive) {
            return;
        }

        this._highlightedPath = [];
        this._highlightedStay = null;
        this._isTravelHighlightActive = false;

        this._drawMapPaths(segments);
    }

    resetMapZoom() {
        this._isMapZoomedToSegment = false;
        this.fitMap();
    }

    zoomToStay(stay) {
        if (!stay?.center) return;
        this._isMapZoomedToSegment = true;
        this.fitMap({bounds: [stay.center], defer: false});
    }

    zoomToPoints(points) {
        if (!Array.isArray(points) || points.length < 2) return;
        this._isMapZoomedToSegment = true;
        this.fitMap({bounds: points, defer: false});
    }

    fitMap({defer = false, bounds = null, pad = 0.1} = {}) {
        if (bounds === null) {
            if (!this._fullDayPaths.length) return;
            bounds = this._fullDayPaths[0].points.map((point) => point.point);
        }

        const normalizedBounds = bounds
            .map(normalizeLatLng)
            .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
        if (!normalizedBounds.length) return;

        const paddedBounds = this._Leaflet.latLngBounds(normalizedBounds).pad(pad);
        const doFit = () => this._leafletMap.fitBounds(paddedBounds, {maxZoom: 14});

        if (defer) {
            requestAnimationFrame(() => requestAnimationFrame(doFit));
        } else {
            doFit();
        }
    }

    _drawMapPaths(segments) {
        this._mapLayers.forEach((layer) => layer.remove());
        this._mapLayers = [];

        this._drawMapLines();
        this._drawMapMarkers(segments);
        this._mapLayers.forEach((layer) => this._leafletMap.addLayer(layer));
    }

    _drawMapMarkers(segments) {
        const stayMarkers = Array.isArray(segments)
            ? segments.filter((segment) => segment?.type === "stay")
            : [];

        stayMarkers.forEach((stay) => {
            const icon = createMarkerIcon({
                iconName: stay.zoneIcon || "mdi:map-marker",
                markerSize: 18,
                iconSize: 14,
                backgroundColor: "var(--primary-color)",
                borderColor: "color-mix(in srgb, black 30%, var(--primary-color))",
                iconPadding: "2px",
                leafletIconSize: [22, 22],
            });

            this._mapLayers.push(this._Leaflet.marker(stay.center, {icon, zIndexOffset: 100}));
        });

        if (!this._highlightedStay) return;

        const icon = createMarkerIcon({
            iconName: this._highlightedStay.zoneIcon || "mdi:map-marker",
            markerSize: 22,
            iconSize: 22,
            backgroundColor: "var(--accent-color)",
            borderColor: "color-mix(in srgb, black 30%, var(--accent-color))",
            leafletIconSize: [26, 26],
        });

        this._mapLayers.push(this._Leaflet.marker(this._highlightedStay.center, {icon, zIndexOffset: 1000}));
    }

    _drawMapLines() {
        const paths = [...this._fullDayPaths, ...this._highlightedPath];

        paths.forEach((path) => {
            this._mapLayers.push(this._Leaflet.polyline(path.points.map((point) => point.point), {
                color: `color-mix(in srgb, black 30%, ${path.color})`, opacity: 1, weight: path.weight + 3
            }));
            this._mapLayers.push(this._Leaflet.polyline(path.points.map((point) => point.point), {
                color: path.color, opacity: 1, weight: path.weight
            }));
        });
    }
}

const createMarkerIcon = ({iconName, markerSize, iconSize, backgroundColor, borderColor, leafletIconSize, iconPadding = "0"}) => {
    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", iconName);
    haIcon.setAttribute("style", `color: white; --mdc-icon-size: ${iconSize}px; padding: ${iconPadding}`);

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(haIcon);
    iconDiv.setAttribute("style", `height: ${markerSize}px; width: ${markerSize}px; background-color: ${backgroundColor}; border-radius: 50%; border: 2px solid ${borderColor}; display: flex;`);

    return Leaflet.divIcon({html: iconDiv, className: "my-leaflet-icon", iconSize: leafletIconSize});
};

const createTileLayer = (leaflet) => leaflet.tileLayer(
    `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}${leaflet.Browser.retina ? "@2x.png" : ".png"}`,
    {
        attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        minZoom: 0,
        maxZoom: 20,
    }
);

const normalizeLatLng = (point) => {
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
};
