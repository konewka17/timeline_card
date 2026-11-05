import memoizeOne from "memoize-one";
import { supportsVectorMaps } from "./ha-frontend/src/common/map/base-layer";
import type { MapEngine } from "./ha-frontend/src/common/map/map-engine";
import { resolveMapStyle } from "./ha-frontend/src/common/map/map-styles";
import { readMapThemeColors } from "./ha-frontend/src/common/map/map-theme-colors";
import { deepEqual } from "./ha-frontend/src/common/util/deep-equal";
import { ensureMapTilesToken } from "./ha-frontend/src/data/map_tiles";

const DRAWN_FALLBACK = 3000;

type ThemeMode = "auto" | "light" | "dark";

interface TimelineMapOptions {
    themeMode: ThemeMode;
    zoom: number;
    debugLog: (message: string) => void;
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

    private _resizeObserver = new ResizeObserver(() => this._engine?.invalidateSize());

    private _destroyed = false;

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
        if (themesChanged) this._updateMapAppearance();
    }

    public destroy(): void {
        this._destroyed = true;
        this._resizeObserver.disconnect();
        this._engine?.destroy();
        this._engine = undefined;
        this._setupAttempt++;
        this._startingEngine?.destroy();
        this._startingEngine = undefined;
        clearTimeout(this._drawnFallback);
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
        this._engine?.destroy();
        this._engine = undefined;
        this._loadMap();
    }
}
