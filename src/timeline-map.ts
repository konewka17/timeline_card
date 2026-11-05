import memoizeOne from "memoize-one";
import { supportsVectorMaps } from "./ha-frontend/src/common/map/base-layer";
import { hexBlend } from "./ha-frontend/src/common/color/hex";
import type { MapEngine, MapItemHandle, MapLatLng, MapPath } from "./ha-frontend/src/common/map/map-engine";
import { resolveMapStyle } from "./ha-frontend/src/common/map/map-styles";
import { readMapThemeColors } from "./ha-frontend/src/common/map/map-theme-colors";
import { deepEqual } from "./ha-frontend/src/common/util/deep-equal";
import { ensureMapTilesToken } from "./ha-frontend/src/data/map_tiles";
import { getTrackColor } from "./utils.js";

const DRAWN_FALLBACK = 3000;

const pathBorder = (color: string, width: number) => ({ color: hexBlend("#000", color, 30), width });

type ThemeMode = "auto" | "light" | "dark";

interface TimelineMapOptions {
    themeMode: ThemeMode;
    zoom: number;
    debugLog: (message: string) => void;
}

interface DayPath {
    entityIndex: number;
    isActive: boolean;
    points: MapLatLng[];
    color: string;
}

interface CurrentLocation {
    entityIndex: number;
    point: MapLatLng;
    picture: string | null;
    icon: string | null;
    name: string;
    color: string;
    isActive: boolean;
}

// Engine lifecycle ported from ha-map.ts (_loadMap, _setUpEngine, _handleEngineFatal, _updateMapAppearance).
export class TimelineMap {
    private _engine?: MapEngine;

    private _startingEngine?: MapEngine;

    private _setupAttempt = 0;

    private _loading = false;

    private _forceLeaflet = false;

    private _mapDrawn = false;

    private _drawnFallback?: number;

    private _mapElement?: HTMLDivElement;

    private _themeColors?: Record<string, string>;

    private _resolveMapStyle = memoizeOne(resolveMapStyle);

    private _resizeObserver = new ResizeObserver(() => {
        this._engine?.invalidateSize();
        this._runPendingFit();
    });

    private _destroyed = false;

    private _handles: MapItemHandle[] = [];

    private _highlightHandles: MapItemHandle[] = [];

    private _pendingFit?: () => void;

    private _lastFit?: () => void;

    private _hasFitted = false;

    private _dayPaths: DayPath[] = [];

    private _segments: any[] = [];

    private _highlightedPath: MapLatLng[] = [];

    private _highlightedStay: any = null;

    private _onTrackClick: (entityIndex: number) => void = () => undefined;

    private _animateHighlightedPath = false;

    public _currentLocations: CurrentLocation[] = [];

    constructor(
        private _container: HTMLElement,
        private _hass: any,
        private _options: TimelineMapOptions,
    ) {
        this._resizeObserver.observe(this._container);
        this._loadMap();
    }

    public setHass(hass: any): void {
        const themesChanged = hass.themes !== this._hass.themes;
        this._hass = hass;
        if (!themesChanged) return;
        this._updateMapAppearance();
        this._draw();
    }

    public destroy(): void {
        this._destroyed = true;
        this._resizeObserver.disconnect();
        this._clearHandles();
        this._engine?.destroy();
        this._engine = undefined;
        this._setupAttempt++;
        this._startingEngine?.destroy();
        this._startingEngine = undefined;
        clearTimeout(this._drawnFallback);
    }

    public setDaySegments(
        tracks: any[],
        { activeEntityIndex = 0, onTrackClick, colors = [], hideUnselected = false, animateHighlightedPath = false }: any = {},
    ): void {
        this._onTrackClick = onTrackClick;
        this._animateHighlightedPath = animateHighlightedPath;
        this._dayPaths = tracks
            .map((track, index) => ({
                entityIndex: index,
                isActive: index === activeEntityIndex,
                points: track.segments.flatMap((segment) => {
                    if (segment.type === "stay") return [[segment.center.lat, segment.center.lon]];
                    return segment.points.map((point) => point.point);
                }),
                color: getTrackColor(index, colors),
            }))
            .filter((path) => !hideUnselected || path.isActive);
        this._segments = tracks[activeEntityIndex]?.segments || [];
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._draw();
    }

    public highlightSegment(segment: any): void {
        this._highlightedStay = segment.type === "stay" ? segment : null;
        this._highlightedPath = segment.type === "move" ? segment.points.map((point) => point.point) : [];
        this._drawHighlight();
    }

    public clearHighlight(): void {
        if (!this._highlightedPath.length && !this._highlightedStay) return;
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._drawHighlight();
    }

    public fitMap(bounds: MapLatLng[] | null = null): void {
        this._lastFit = () => this.fitMap(bounds);
        const points = bounds ?? this._activePath?.points ?? [];
        if (!points.length) {
            this._setView([this._hass.config.latitude, this._hass.config.longitude], this._options.zoom);
            return;
        }
        this._fitBounds(points);
    }

    private get _activePath(): DayPath | undefined {
        return this._dayPaths.find((path) => path.isActive);
    }

    // Ported from ha-map.ts fitBounds / setView / _deferIfUnsized / _runPendingFit.
    private _fitBounds(points: MapLatLng[]): void {
        if (!this._engine) {
            this._pendingFit = () => this._fitBounds(points);
            return;
        }
        if (this._deferIfUnsized(() => this._fitBounds(points))) {
            return;
        }
        this._engine.fitBounds(points, { maxZoom: this._options.zoom, animate: this._hasFitted });
        this._hasFitted = true;
    }

    private _setView(center: MapLatLng, zoom: number): void {
        if (!this._engine) {
            this._pendingFit = () => this._setView(center, zoom);
            return;
        }
        this._pendingFit = undefined;
        this._engine.setView(center, zoom);
    }

    private _deferIfUnsized(fit: () => void): boolean {
        if (this._engine!.hasUsableSize()) {
            this._pendingFit = undefined;
            return false;
        }
        this._pendingFit = fit;
        return true;
    }

    private _runPendingFit(): void {
        if (!this._pendingFit || !this._engine) {
            return;
        }
        if (this._engine.hasUsableSize()) {
            const pendingFit = this._pendingFit;
            this._pendingFit = undefined;
            pendingFit();
        }
    }

    private _draw(): void {
        const engine = this._engine;
        if (!engine) return;
        this._handles.forEach((handle) => handle.remove());
        this._handles = [];

        const addDayPath = (path: DayPath) => {
            const color = this._resolveColor(path.color);
            this._addPath(
                path.points,
                {
                    color,
                    width: 4,
                    border: path.isActive ? pathBorder(color, 7) : undefined,
                    onClick: () => this._onTrackClick(path.entityIndex),
                },
                path.isActive ? 1 : 0.8,
                this._handles,
            );
        };
        this._dayPaths.filter((path) => !path.isActive).forEach(addDayPath);
        this._dayPaths.filter((path) => path.isActive).forEach(addDayPath);

        const activeColor = this._activePath?.color ?? "var(--primary-color)";
        this._segments
            .filter((segment) => segment.type === "stay")
            .forEach((stay) => {
                const element = createStayMarker(stay.zoneIcon, 18, 14, activeColor, "2px");
                this._handles.push(engine.addMarker(element, [stay.center.lat, stay.center.lon], { size: [22, 22], interactive: false }));
            });

        if (this._currentLocations.length === 1) {
            this._handles.push(
                engine.addMarker(createCurrentLocationDot(), this._currentLocations[0].point, {
                    size: [20, 20],
                    interactive: false,
                    raised: true,
                }),
            );
        } else {
            this._currentLocations.forEach((location) => {
                const element = createEntityMarker(location);
                element.style.cursor = "pointer";
                element.addEventListener("click", () => this._onTrackClick(location.entityIndex));
                this._handles.push(
                    engine.addMarker(element, location.point, {
                        size: [48, 48],
                        title: location.name,
                        raised: location.isActive,
                    }),
                );
            });
        }

        this._drawHighlight();
    }

    // Own handles: redrawing everything on hover makes the paths flicker.
    private _drawHighlight(): void {
        const engine = this._engine;
        if (!engine) return;
        this._highlightHandles.forEach((handle) => handle.remove());
        this._highlightHandles = [];

        const accentColor = this._resolveColor("var(--accent-color)");
        this._addPath(
            this._highlightedPath,
            {
                color: accentColor,
                width: 7,
                border: pathBorder(accentColor, 10),
                animated: this._animateHighlightedPath,
            },
            1,
            this._highlightHandles,
        );
        if (this._highlightedStay) {
            const stay = this._highlightedStay;
            const element = createStayMarker(stay.zoneIcon, 22, 22, "var(--accent-color)", "0");
            this._highlightHandles.push(
                engine.addMarker(element, [stay.center.lat, stay.center.lon], { size: [26, 26], interactive: false, raised: true }),
            );
        }
    }

    private _clearHandles(): void {
        [...this._handles, ...this._highlightHandles].forEach((handle) => handle.remove());
        this._handles = [];
        this._highlightHandles = [];
    }

    private _addPath(
        points: MapLatLng[],
        path: Omit<MapPath, "segments" | "markers">,
        opacity: number,
        handles: MapItemHandle[],
    ): void {
        if (points.length < 2) return;
        handles.push(this._engine!.addPath({ ...path, segments: [{ points, opacity }], markers: [] }));
    }

    // MapLibre cannot read CSS variables.
    private _resolveColor(color: string): string {
        const variable = color.match(/^var\((--[\w-]+)\)$/)?.[1];
        return variable ? getComputedStyle(this._container).getPropertyValue(variable).trim() : color;
    }

    private get _darkMode(): boolean {
        return (
            this._options.themeMode === "dark" ||
            (this._options.themeMode === "auto" && Boolean(this._hass.themes?.darkMode))
        );
    }

    private _readThemeColors(): void {
        const pageDark = Boolean(this._hass.themes?.darkMode);
        const colors = this._darkMode === pageDark ? readMapThemeColors(this._container) : undefined;
        if (!deepEqual(colors, this._themeColors)) {
            this._themeColors = colors;
        }
    }

    private get _resolvedMapStyle() {
        return this._resolveMapStyle(undefined, this._darkMode, this._themeColors);
    }

    private _updateMapAppearance(): void {
        this._readThemeColors();

        const map = this._mapElement;
        if (!map) {
            return;
        }
        map.classList.toggle("dark", this._darkMode);
        map.classList.toggle("drawn", this._mapDrawn);
        map.classList.toggle("space", this._vectorEngine && this._mapDrawn);
        map.classList.toggle("forced-dark", this._options.themeMode === "dark");
        map.classList.toggle("forced-light", this._options.themeMode === "light");
        this._engine?.setMapStyle(this._resolvedMapStyle);
    }

    private _markDrawn(attempt: number): void {
        if (attempt !== this._setupAttempt || this._mapDrawn) {
            return;
        }
        clearTimeout(this._drawnFallback);
        this._mapDrawn = true;
        this._updateMapAppearance();
    }

    private get _vectorEngine(): boolean {
        return !this._forceLeaflet && supportsVectorMaps();
    }

    private async _createEngine(): Promise<MapEngine> {
        if (!this._vectorEngine) {
            const leaflet = await import("./ha-frontend/src/common/map/engines/leaflet-map-engine");
            return new leaflet.LeafletMapEngine();
        }
        const maplibre = await import("./ha-frontend/src/common/map/engines/maplibre-map-engine");
        return new maplibre.MapLibreMapEngine();
    }

    private async _loadMap(): Promise<void> {
        const onFallback = this._forceLeaflet || !supportsVectorMaps();
        try {
            await this._setUpEngine();
        } catch (err) {
            if (this._destroyed) {
                return;
            }
            if (onFallback) {
                throw err;
            }
            this._options.debugLog(`Map engine setup failed, falling back to Leaflet: ${err}`);
            this._forceLeaflet = true;
            await this._loadMap();
        }
    }

    private async _setUpEngine(): Promise<void> {
        if (this._loading) return;
        this._mapElement?.remove();
        const map = document.createElement("div");
        map.id = "map";
        map.classList.toggle("dark", this._darkMode);
        this._container.append(map);
        this._mapElement = map;
        this._loading = true;
        this._mapDrawn = false;
        clearTimeout(this._drawnFallback);
        const attempt = ++this._setupAttempt;
        let engine: MapEngine | undefined;
        try {
            const token = await ensureMapTilesToken(this._hass.connection);

            this._readThemeColors();

            const rasterOnly = this._forceLeaflet;
            engine = await this._createEngine();
            if (attempt !== this._setupAttempt) {
                return;
            }
            this._options.debugLog(`Map engine ${this._vectorEngine ? "MapLibre" : "Leaflet"}`);
            this._startingEngine = engine;
            this._drawnFallback = window.setTimeout(() => this._markDrawn(attempt), DRAWN_FALLBACK);
            await engine.init(map, {
                center: [this._hass.config.latitude, this._hass.config.longitude],
                zoom: this._options.zoom,
                mapStyle: this._resolvedMapStyle,
                token,
                rasterOnly: this._forceLeaflet,
                zoomControlPosition: "topleft",
                events: {
                    fatal: () => this._handleEngineFatal(),
                    drawn: () => this._markDrawn(attempt),
                },
            });
            if (this._destroyed || attempt !== this._setupAttempt) {
                return;
            }
            if (this._forceLeaflet && !rasterOnly) {
                throw new Error("Map engine failed during setup");
            }
            this._engine = engine;
            this._updateMapAppearance();
            this._draw();
            this._runPendingFit();
        } finally {
            if (attempt === this._setupAttempt) {
                this._loading = false;
                this._startingEngine = undefined;
            }
            if (engine && engine !== this._engine) {
                engine.destroy();
            }
        }
    }

    private _handleEngineFatal(): void {
        if (this._forceLeaflet) {
            return;
        }
        this._options.debugLog("Map engine fatal, falling back to Leaflet");
        this._forceLeaflet = true;
        if (this._loading) {
            this._startingEngine?.destroy();
            return;
        }
        this._clearHandles();
        this._engine?.destroy();
        this._engine = undefined;
        this._hasFitted = false;
        this._pendingFit = this._lastFit;
        this._loadMap();
    }
}

function createStayMarker(zoneIcon: string | undefined, markerSize: number, iconSize: number, color: string, padding: string) {
    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", zoneIcon || "mdi:map-marker");
    haIcon.setAttribute("style", `color: white; --mdc-icon-size: ${iconSize}px; padding: ${padding}`);

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(haIcon);
    iconDiv.setAttribute(
        "style",
        `height: ${markerSize}px; width: ${markerSize}px; background-color: ${color}; border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, ${color}); display: flex;`,
    );
    return iconDiv;
}

function createEntityMarker(location: CurrentLocation) {
    let icon: HTMLElement;
    if (location.picture) {
        const picture = document.createElement("img");
        picture.src = location.picture;
        picture.alt = location.name;
        picture.setAttribute("style", "height: 42px; width: 42px; border-radius: 50%; object-fit: cover;");
        icon = picture;
    } else if (location.icon) {
        icon = document.createElement("ha-icon");
        icon.setAttribute("icon", location.icon);
        icon.setAttribute(
            "style",
            "height: 42px; width: 42px; display: flex; align-items: center; justify-content: center; color: white; --mdc-icon-size: 26px;",
        );
    } else {
        const getAbbreviation = (name: string) => {
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
            "height: 42px; width: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5em; font-weight: bold; color: white;",
        );
    }
    const iconDiv = document.createElement("div");
    iconDiv.appendChild(icon);
    iconDiv.setAttribute(
        "style",
        `height: 42px; width: 42px; border-radius: 50%; border: 3px solid color-mix(in srgb, black 30%, ${location.color}); overflow: hidden; background-color: ${location.color}`,
    );
    return iconDiv;
}

function createCurrentLocationDot() {
    const innerDot = document.createElement("div");
    innerDot.setAttribute(
        "style",
        "height: 14px; width: 14px; border-radius: 50%; background: #1a73e8; border: 3px solid white; box-shadow: 0 1px 6px #0006;",
    );

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(innerDot);
    iconDiv.setAttribute("style", "height: 20px; width: 20px; display: flex; align-items: center; justify-content: center;");
    return iconDiv;
}
