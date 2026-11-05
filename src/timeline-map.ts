import memoizeOne from "memoize-one";
import { supportsVectorMaps } from "./ha-frontend/src/common/map/base-layer";
import { hexBlend } from "./ha-frontend/src/common/color/hex";
import { computeDomain } from "./ha-frontend/src/common/entity/compute_domain";
import { zoneColor } from "./ha-frontend/src/common/map/entity-map-colors";
import { distanceMeters } from "./ha-frontend/src/common/map/map-engine";
import type {
    MapCircleHandle,
    MapClusterIcon,
    MapEngine,
    MapItemHandle,
    MapLatLng,
    MapMarkerHandle,
    MapPath,
} from "./ha-frontend/src/common/map/map-engine";
import { type MapStyleConfig, resolveMapStyle } from "./ha-frontend/src/common/map/map-styles";
import { readMapThemeColors } from "./ha-frontend/src/common/map/map-theme-colors";
import { deepEqual } from "./ha-frontend/src/common/util/deep-equal";
import { createZoneMarkerElement, ZONE_CIRCLE_SIZE } from "./ha-frontend/src/common/map/zone-marker";
import { type EntityRegistryEntry, subscribeEntityRegistry } from "./ha-frontend/src/data/entity/entity_registry";
import { ensureMapTilesToken } from "./ha-frontend/src/data/map_tiles";
import { FLOATING_LIFT, floatingMarkerFootprint, type HaEntityMarker } from "./ha-entity-marker";
import {
    CLUSTER_AVATAR_SIZE,
    CLUSTER_BUBBLE_GAP,
    CLUSTER_BUBBLE_PADDING,
    CLUSTER_MORE_WIDTH,
    CLUSTER_TAIL_SIZE,
} from "./ha-map-styles";
import { findFirstActiveZone } from "./ha-frontend/src/common/entity/get_entity_location";
import { clearMarkerAccessibility, setMarkerAccessibility } from "./ha-frontend/src/common/map/marker-accessibility";
import { getTrackColor } from "./utils.js";

const DRAWN_FALLBACK = 3000;
// Fixes this good (meters) draw a soft disc without an outline
const PRECISE_GPS_ACCURACY = 10;

// Beyond this the last slot becomes a count
const CLUSTER_MAX_AVATARS = 4;
const CLUSTER_MORE_MAX = 99;
// Space an opened bubble keeps from the map edges
const CLUSTER_BUBBLE_MARGIN = 12;
// The tail is a rotated square on the bubble's bottom edge, reaching half its diagonal below
const CLUSTER_TAIL_HEIGHT = Math.round((CLUSTER_TAIL_SIZE * Math.SQRT2) / 2);
const CLUSTER_ZONE_SPACING = 2;
const CLUSTER_RADIUS = 40;
// Same-zone markers share the zone's bubble while they span at most this many
// pixels; further apart they show their actual positions
const ZONE_GROUP_RADIUS = 160;

const pathBorder = (color: string, width: number) => ({ color: hexBlend("#000", color, 30), width });

type ThemeMode = "auto" | "light" | "dark";

interface TimelineMapOptions {
    themeMode: ThemeMode;
    mapStyle?: MapStyleConfig;
    scaleRuler: boolean;
    currentLocationMarker: "default" | "entity";
    zoom: number;
    showZones: boolean;
    cluster: boolean;
    debugLog: (message: string) => void;
}

interface DayPath {
    entityIndex: number;
    isActive: boolean;
    points: MapLatLng[];
    color: string;
}

// Data carried by entity markers for rendering cluster bubbles
interface ClusterData {
    entityIndex: number;
    entityId: string;
    title: string;
    picture?: string;
    label: string;
    showIcon: boolean;
    unit: string;
    color: string;
    isActive: boolean;
    zoneId?: string;
}

interface CurrentLocation {
    entityIndex: number;
    entityId: string;
    config: { name?: string; label_mode?: "state" | "attribute" | "icon"; attribute?: string; unit?: string };
    point: MapLatLng;
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

    // Marker elements survive redraws, so pictures do not reload.
    private _entityMarkers = new Map<string, HaEntityMarker>();

    private _clusterAvatars = new Map<string, HaEntityMarker>();

    private _zonePositions: Record<string, MapLatLng> = {};

    private _zoneRadii: Record<string, number> = {};

    // Updated in place, so redraws do not flash the circles.
    private _zoneCircleHandles: MapCircleHandle[] = [];

    // Registry creation order decides the zone colors
    private _entityReg: EntityRegistryEntry[] = [];

    private _unsubscribeRegistry?: () => void;

    private _pendingFit?: () => void;

    private _lastFit?: () => void;

    private _hasFitted = false;

    // Entity markers float this many pixels above their location; fits keep that room at the top.
    private _markerLift = 0;

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
        if (_options.showZones) {
            this._unsubscribeRegistry = subscribeEntityRegistry(_hass.connection, (entries) => {
                this._entityReg = entries;
                this._draw();
            });
        }
        this._loadMap();
    }

    public setHass(hass: any): void {
        const themesChanged = hass.themes !== this._hass.themes;
        this._hass = hass;
        if (!themesChanged) return;
        this._updateMapAppearance();
        this._draw();
    }

    public setCluster(cluster: boolean): void {
        this._options.cluster = cluster;
        this._draw();
    }

    public destroy(): void {
        this._destroyed = true;
        this._resizeObserver.disconnect();
        this._unsubscribeRegistry?.();
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
        this._engine.fitBounds(points, {
            maxZoom: this._options.zoom,
            padding: { top: this._markerLift },
            animate: this._hasFitted,
        });
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

        this._zonePositions = {};
        this._zoneRadii = {};
        if (this._options.showZones) {
            this._drawZones();
        }

        const addDayPath = (path: DayPath) => {
            const color = this._resolveColor(path.color);
            this._addPath(
                path.points,
                {
                    color,
                    width: 4,
                    border: path.isActive ? pathBorder(color, 7) : undefined,
                    onClick: path.isActive ? undefined : () => this._onTrackClick(path.entityIndex),
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
                const element = createStayMarker(stay.zoneIcon, 14, activeColor);
                this._handles.push(engine.addMarker(element, [stay.center.lat, stay.center.lon], { size: [22, 22], interactive: false }));
            });

        this._markerLift = 0;
        if (this._currentLocations.length === 1 && this._options.currentLocationMarker === "default") {
            this._handles.push(
                engine.addMarker(createCurrentLocationDot(), this._currentLocations[0].point, {
                    size: [20, 20],
                    interactive: false,
                    raised: true,
                }),
            );
        } else {
            const markerSize = parseFloat(getComputedStyle(this._container).getPropertyValue("--ha-marker-size")) || 48;
            this._currentLocations.forEach((location) => this._addEntityMarker(location, markerSize));
            if (this._currentLocations.length) {
                this._markerLift = floatingMarkerFootprint(markerSize, false).anchor[1];
            }
        }
        engine.setClustering(
            this._options.cluster
                ? {
                      radius: CLUSTER_RADIUS,
                      iconBuilder: this._createClusterBubble,
                      // Everyone in a zone shares its bubble until zooming spreads them
                      groupKey: (marker) => (marker.clusterData as ClusterData)?.zoneId,
                      groupRadius: ZONE_GROUP_RADIUS,
                  }
                : null,
        );

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
            const element = createStayMarker(stay.zoneIcon, 22, "var(--accent-color)");
            this._highlightHandles.push(
                engine.addMarker(element, [stay.center.lat, stay.center.lon], { size: [26, 26], interactive: false, raised: true }),
            );
        }
    }

    // Ported from the entity part of ha-map.ts _drawEntities.
    private _addEntityMarker(location: CurrentLocation, markerSize: number): void {
        const stateObj = this._hass.states[location.entityId];
        const entity = location.config;
        const title = entity.name ?? this._hass.formatEntityName(stateObj);
        const { entity_picture: entityPicture, gps_accuracy: gpsAccuracy } = stateObj.attributes;
        const color = this._resolveColor(location.color);

        const marker = this._takeEntityMarker(this._entityMarkers, location.entityIndex, location.entityId);
        marker.stateObj = stateObj;
        marker.entityId = location.entityId;
        marker.entityName =
            entity.label_mode === "state"
                ? this._hass.formatEntityState(stateObj)
                : entity.label_mode === "attribute" && entity.attribute !== undefined
                  ? this._hass.formatEntityAttributeValue(stateObj, entity.attribute)
                  : (entity.name ??
                    title
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .substr(0, 3));
        marker.showIcon = entity.label_mode === "icon";
        marker.entityUnit = entity.unit && entity.label_mode === "attribute" ? entity.unit : "";
        marker.entityPicture = entityPicture && !entity.label_mode ? this._hass.hassUrl(entityPicture) : "";
        marker.entityColor = color;
        setActiveFrame(marker, location.isActive ? color : undefined, "3px");
        marker.floating = true;

        let zoneId: string | undefined;
        if (["person", "device_tracker"].includes(computeDomain(location.entityId))) {
            const inZones: string[] | undefined = stateObj.attributes.in_zones;
            if (Array.isArray(inZones) && inZones.length > 0) {
                const activeZone = findFirstActiveZone(inZones, this._hass.states);
                if (activeZone && this._zonePositions[activeZone.entity_id]) {
                    zoneId = activeZone.entity_id;
                }
            } else if (!Array.isArray(inZones) || !["not_home", "unknown", "unavailable"].includes(stateObj.state)) {
                zoneId = this._zoneContaining(location.point, gpsAccuracy);
            }
        }

        const clusterData: ClusterData = {
            entityIndex: location.entityIndex,
            entityId: location.entityId,
            title,
            picture: marker.entityPicture || undefined,
            label: marker.entityName,
            showIcon: marker.showIcon,
            unit: marker.entityUnit,
            color,
            isActive: location.isActive,
            zoneId,
        };

        const accuracy = gpsAccuracy || 0;
        this._handles.push(
            this._engine!.addMarker(marker, location.point, {
                ...floatingMarkerFootprint(markerSize, false),
                title,
                cluster: true,
                raised: location.isActive,
                clusterData,
                decoration:
                    accuracy > 0
                        ? { radius: accuracy, color, outline: accuracy > PRECISE_GPS_ACCURACY }
                        : undefined,
            }),
        );
    }

    // The cached element serves again once it left the screen; Leaflet keeps an
    // outgoing bubble on screen during its zoom animation
    private _takeEntityMarker(
        cache: Map<string, HaEntityMarker>,
        entityIndex: number,
        entityId: string,
    ): HaEntityMarker {
        const cached = cache.get(entityId);
        if (cached && !cached.isConnected) {
            return cached;
        }
        const marker = document.createElement("timeline-entity-marker");
        marker.style.cursor = "pointer";
        marker.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this._onTrackClick(entityIndex);
        });
        cache.set(entityId, marker);
        return marker;
    }

    private _zoneContaining(position: MapLatLng, gpsAccuracy = 0): string | undefined {
        let found: string | undefined;
        let foundRadius = Infinity;
        let foundDistance = Infinity;
        for (const [zoneId, radius] of Object.entries(this._zoneRadii)) {
            const distance = distanceMeters(position, this._zonePositions[zoneId]);
            if (
                distance - gpsAccuracy < radius &&
                (radius < foundRadius || (radius === foundRadius && distance < foundDistance))
            ) {
                found = zoneId;
                foundRadius = radius;
                foundDistance = distance;
            }
        }
        return found;
    }

    // Renders a marker cluster as a bubble of its members' avatars
    private _createClusterBubble = (
        members: MapMarkerHandle[],
        _location: MapLatLng,
        zoneId?: string,
        expanded = false,
    ): MapClusterIcon => {
        const data = members.map((member) => member.clusterData as ClusterData);
        const shown = expanded || data.length <= CLUSTER_MAX_AVATARS ? data : data.slice(0, CLUSTER_MAX_AVATARS - 1);
        const hidden = data.length - shown.length;

        const bubble = document.createElement("div");
        bubble.className = "cluster-bubble";
        for (const member of shown) {
            const avatar = this._takeEntityMarker(this._clusterAvatars, member.entityIndex, member.entityId);
            avatar.stateObj = this._hass.states[member.entityId];
            avatar.entityId = member.entityId;
            avatar.entityName = member.label;
            avatar.entityUnit = member.unit;
            avatar.showIcon = member.showIcon;
            avatar.entityPicture = member.picture ?? "";
            avatar.entityColor = member.color;
            setActiveFrame(avatar, member.isActive ? member.color : undefined, "2px");
            // In an expanded bubble each avatar is reachable on its own
            clearMarkerAccessibility(avatar);
            if (expanded) {
                setMarkerAccessibility(avatar, member.title, true);
            }
            bubble.appendChild(avatar);
        }

        // An expanded bubble wraps once a row would not fit the map
        const perRow = expanded
            ? Math.max(
                  1,
                  Math.floor(
                      (this._container.offsetWidth -
                          2 * CLUSTER_BUBBLE_MARGIN -
                          2 * CLUSTER_BUBBLE_PADDING +
                          CLUSTER_BUBBLE_GAP) /
                          (CLUSTER_AVATAR_SIZE + CLUSTER_BUBBLE_GAP),
                  ),
              )
            : shown.length;
        const columns = Math.min(shown.length, perRow);
        const rows = Math.ceil(shown.length / perRow);
        let width = columns * CLUSTER_AVATAR_SIZE + (columns - 1) * CLUSTER_BUBBLE_GAP + 2 * CLUSTER_BUBBLE_PADDING;
        if (hidden > 0) {
            const more = document.createElement("span");
            more.className = "more";
            more.textContent = hidden > CLUSTER_MORE_MAX ? `${CLUSTER_MORE_MAX}+` : `+${hidden}`;
            bubble.appendChild(more);
            width += CLUSTER_MORE_WIDTH + CLUSTER_BUBBLE_GAP;
        }

        const height =
            rows * CLUSTER_AVATAR_SIZE +
            (rows - 1) * CLUSTER_BUBBLE_GAP +
            2 * CLUSTER_BUBBLE_PADDING +
            CLUSTER_TAIL_HEIGHT;
        const root = document.createElement("div");
        root.className = "cluster-marker";
        const tail = document.createElement("div");
        tail.className = "cluster-bubble-tail";
        root.append(bubble, tail);

        // A cluster of one zone's occupants floats above that zone's circle
        const zonePosition = zoneId ? this._zonePositions[zoneId] : undefined;
        return {
            element: root,
            size: [width, height],
            location: zonePosition,
            anchor: [width / 2, height + (zonePosition ? ZONE_CIRCLE_SIZE / 2 + CLUSTER_ZONE_SPACING : FLOATING_LIFT)],
        };
    };

    // Ported from the zone part of ha-map.ts _drawEntities.
    private _drawZones(): void {
        const engine = this._engine!;
        const computedStyles = getComputedStyle(this._container);
        let zoneCircleCount = 0;
        for (const stateObj of Object.values<any>(this._hass.states)) {
            const { passive, icon, radius, latitude, longitude } = stateObj.attributes;
            if (computeDomain(stateObj.entity_id) !== "zone" || passive) continue;
            if (typeof latitude !== "number" || typeof longitude !== "number") continue;
            const position: MapLatLng = [latitude, longitude];
            this._zonePositions[stateObj.entity_id] = position;
            if (typeof radius === "number") {
                this._zoneRadii[stateObj.entity_id] = radius;
            }
            const title = this._hass.formatEntityName(stateObj);
            const markerColor = zoneColor(stateObj.entity_id, false, this._entityReg, computedStyles);

            if (radius) {
                const circleOptions = { radius, color: markerColor };
                const circle = this._zoneCircleHandles[zoneCircleCount];
                if (circle) {
                    circle.update(position, circleOptions);
                } else {
                    this._zoneCircleHandles.push(engine.addCircle(position, circleOptions));
                }
                zoneCircleCount++;
            }

            const circleEl = createZoneMarkerElement({ color: markerColor, icon, name: title });
            const openMoreInfo = (ev: Event) => {
                ev.stopPropagation();
                circleEl.dispatchEvent(
                    new CustomEvent("hass-more-info", {
                        detail: { entityId: stateObj.entity_id },
                        bubbles: true,
                        composed: true,
                    }),
                );
            };
            circleEl.addEventListener("click", openMoreInfo);
            circleEl.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openMoreInfo(ev);
                }
            });
            this._handles.push(
                engine.addMarker(circleEl, position, {
                    size: [ZONE_CIRCLE_SIZE, ZONE_CIRCLE_SIZE],
                    interactive: true,
                    title,
                }),
            );
        }
        this._zoneCircleHandles.splice(zoneCircleCount).forEach((handle) => handle.remove());
    }

    private _clearHandles(): void {
        [...this._handles, ...this._highlightHandles, ...this._zoneCircleHandles].forEach((handle) => handle.remove());
        this._handles = [];
        this._highlightHandles = [];
        this._zoneCircleHandles = [];
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
        return this._resolveMapStyle(this._options.mapStyle, this._darkMode, this._themeColors);
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
            engine.setScaleRuler(
                this._options.scaleRuler ? { metric: this._hass.config.unit_system.length === "km" } : null,
            );
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

function createStayMarker(zoneIcon: string | undefined, iconSize: number, color: string) {
    const haIcon = document.createElement("ha-icon");
    haIcon.setAttribute("icon", zoneIcon || "mdi:map-marker");
    haIcon.setAttribute("style", `display: flex; color: white; --mdc-icon-size: ${iconSize}px;`);

    const iconDiv = document.createElement("div");
    iconDiv.appendChild(haIcon);
    iconDiv.setAttribute(
        "style",
        `box-sizing: border-box; background-color: ${color}; border-radius: 50%; border: 2px solid color-mix(in srgb, black 30%, ${color}); display: flex; align-items: center; justify-content: center;`,
    );
    return iconDiv;
}

// Only the active entity's frame takes its color, matching it to its path. Every frame
// keeps the same width, so the picture does not shrink when the active entity changes.
function setActiveFrame(marker: HaEntityMarker, color: string | undefined, width: string) {
    marker.style.setProperty("--ha-marker-border-width", width);
    if (color) {
        marker.style.setProperty("--ha-marker-color", color);
    } else {
        marker.style.removeProperty("--ha-marker-color");
    }
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
