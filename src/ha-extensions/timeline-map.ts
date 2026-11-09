import { css } from "lit";
import type { PropertyValues } from "lit";
import { hexBlend } from "../ha-frontend/src/common/color/hex";
import { computeDomain } from "../ha-frontend/src/common/entity/compute_domain";
import type {
    MapClusterIcon,
    MapItemHandle,
    MapLatLng,
    MapMarkerHandle,
} from "../ha-frontend/src/common/map/map-engine";
import { deepEqual } from "../ha-frontend/src/common/util/deep-equal";
import { floatingMarkerFootprint } from "../ha-frontend/src/components/map/ha-entity-marker";
import { HaMap, type HaMapEntity } from "../ha-frontend/src/components/map/ha-map";
import type { StyledMapPath } from "./path-style";

const pathBorder = (color: string, width: number) => ({ color: hexBlend("#000", color, 30), width });

interface DayPath {
    entityIndex: number;
    isActive: boolean;
    points: MapLatLng[];
    color: string;
}

interface CurrentLocation {
    entityIndex: number;
    entityId: string;
    config: Pick<HaMapEntity, "name" | "label_mode" | "attribute" | "unit">;
    point: MapLatLng;
    color: string;
    isActive: boolean;
}

export class TimelineMap extends HaMap {
    public currentLocationMarker: "default" | "entity" = "default";

    public showZones = false;

    private _dayHandles: MapItemHandle[] = [];

    private _highlightHandles: MapItemHandle[] = [];

    private _dayPaths: DayPath[] = [];

    private _segments: any[] = [];

    private _highlightedPath: MapLatLng[] = [];

    private _highlightedStay: any = null;

    private _onTrackClick: (entityIndex: number) => void = () => undefined;

    private _animateHighlightedPath = false;

    private _locations: CurrentLocation[] = [];

    private _lastFit?: () => void;

    private _superCreateClusterBubble = this._createClusterBubble;

    constructor() {
        super();
        this.addEventListener("hass-more-info", (ev) => {
            const location = this._locations.find(({ entityId }) => entityId === (ev as CustomEvent).detail.entityId);
            if (location) {
                ev.stopPropagation();
                this._onTrackClick(location.entityIndex);
            }
        });
    }

    public setDaySegments(
        tracks: any[],
        { activeEntityIndex, onTrackClick, colors, hideUnselected, animateHighlightedPath, currentLocations, live }: any,
    ): void {
        this._onTrackClick = onTrackClick;
        this._animateHighlightedPath = animateHighlightedPath;
        this._locations = currentLocations;
        this._dayPaths = tracks
            .map((track, index) => ({
                entityIndex: index,
                isActive: index === activeEntityIndex,
                points: track.segments.flatMap((segment: any) => {
                    if (segment.type === "stay") return [[segment.center.lat, segment.center.lon]];
                    return segment.points.map((point: any) => point.point);
                }),
                color: colors[index],
            }))
            .filter((path) => !hideUnselected || path.isActive);
        this._segments = tracks[activeEntityIndex]?.segments || [];
        this.requestUpdate();
        if (live && this._pathHandles.length === this._drawnDayPaths.length) {
            this._drawnDayPaths.forEach((path, index) => this._pathHandles[index].update(this._styledDayPath(path)));
            this._drawDayMarkers();
            return;
        }
        if (!live) {
            this._highlightedPath = [];
            this._highlightedStay = null;
        }
        this._drawPaths();
    }

    public highlightSegment(segment: any): void {
        this._highlightedStay = segment.type === "stay" ? segment : null;
        this._highlightedPath = segment.type === "move" ? segment.points.map((point: any) => point.point) : [];
        this._drawHighlight();
    }

    public clearHighlight(): void {
        if (!this._highlightedPath.length && !this._highlightedStay) return;
        this._highlightedPath = [];
        this._highlightedStay = null;
        this._drawHighlight();
    }

    public fitTo(bounds: MapLatLng[] | null = null): void {
        this._lastFit = () => this.fitTo(bounds);
        if (!this._engine) {
            this._pendingFit = this._lastFit;
            return;
        }
        const points = bounds ?? this._activePath?.points ?? [];
        if (!points.length) {
            this.setView([this._config.latitude, this._config.longitude], this.zoom);
            return;
        }
        this.fitBounds(points, { padding: { top: this._markerLift } });
    }

    // HA fits to its entities once the engine is up, also after falling back to Leaflet.
    public fitMap(options?: Parameters<HaMap["fitMap"]>[0]): void {
        if (this._lastFit && !options) {
            this._lastFit();
            return;
        }
        super.fitMap(options);
    }

    public disconnectedCallback(): void {
        super.disconnectedCallback();
        this._dayHandles = [];
        this._highlightHandles = [];
    }

    protected willUpdate(changedProps: PropertyValues): void {
        super.willUpdate(changedProps);
        if (!this._states) return;
        const entities = this._mapEntities();
        if (!deepEqual(entities, this.entities)) {
            this.entities = entities as HaMapEntity[];
        }
    }

    private get _activePath(): DayPath | undefined {
        return this._dayPaths.find((path) => path.isActive);
    }

    private get _showsDot(): boolean {
        return this._locations.length === 1 && this.currentLocationMarker === "default";
    }

    // Entity markers float this many pixels above their location; fits keep that room at the top.
    private get _markerLift(): number {
        if (this._showsDot || !this._locations.length) return 0;
        return floatingMarkerFootprint(this._getMarkerSize(getComputedStyle(this)), false).anchor[1];
    }

    private _mapEntities(): (string | HaMapEntity)[] {
        const zones = this.showZones ? Object.keys(this._states).filter((id) => computeDomain(id) === "zone") : [];
        if (this._showsDot) return zones;
        // Drawn in this order, so the active entity ends up on top.
        const activeLast = [...this._locations].sort((a, b) => Number(a.isActive) - Number(b.isActive));
        return [
            ...zones,
            ...activeLast.map(({ entityId, color, config }) => ({
                entity_id: entityId,
                color: this._resolveColor(color),
                name: config.name,
                label_mode: config.label_mode,
                attribute: config.attribute,
                unit: config.unit,
            })),
        ];
    }

    private async _createEngine() {
        if (!this._vectorEngine) {
            return new (await import("./leaflet-map-engine")).StyledLeafletEngine();
        }
        return new (await import("./maplibre-map-engine")).StyledMapLibreEngine();
    }

    private _handleEngineFatal(): void {
        this._dayHandles = [];
        this._highlightHandles = [];
        super._handleEngineFatal();
    }

    private _drawEntities(): void {
        super._drawEntities();
        this._entityMarkers.forEach((marker, entityId) => {
            const location = this._locations.find((candidate) => candidate.entityId === entityId);
            marker.toggleAttribute("inactive", !location?.isActive);
        });
    }

    // Only the active entity's frame takes its colour. Every frame keeps the same width, so the picture
    // keeps its size when the active entity changes. Members arrive active last; the bubble keeps entity order.
    private _createClusterBubble = (
        members: MapMarkerHandle[],
        location: MapLatLng,
        zoneId?: string,
        expanded = false,
    ): MapClusterIcon => {
        const entityOrder = (member: MapMarkerHandle) =>
            this._locations.findIndex(({ entityId }) => entityId === (member.clusterData as any).entityId);
        const inEntityOrder = [...members].sort((a, b) => entityOrder(a) - entityOrder(b));
        const icon = this._superCreateClusterBubble(inEntityOrder, location, zoneId, expanded);
        icon.element.querySelectorAll<any>("timeline-ha-entity-marker").forEach((avatar) => {
            const isActive = this._locations.find(({ entityId }) => entityId === avatar.entityId)?.isActive;
            avatar.style.setProperty("--ha-marker-border-width", "2px");
            avatar.style.setProperty("--ha-marker-color", isActive ? avatar.entityColor : "transparent");
        });
        return icon;
    };

    // HA calls this whenever paths need drawing: engine ready, theme changed, fallback.
    private _drawPaths(): void {
        const engine = this._engine;
        if (!engine) return;
        this._pathHandles.forEach((handle) => handle.remove());
        this._pathHandles = this._drawnDayPaths.map((path) => engine.addPath(this._styledDayPath(path)));
        this._drawDayMarkers();
        this._drawHighlight();
    }

    private get _drawnDayPaths(): DayPath[] {
        return [
            ...this._dayPaths.filter((path) => !path.isActive),
            ...this._dayPaths.filter((path) => path.isActive),
        ].filter((path) => path.points.length >= 2);
    }

    private _styledDayPath(path: DayPath): StyledMapPath {
        const color = this._resolveColor(path.color);
        return {
            color,
            width: 4,
            border: path.isActive ? pathBorder(color, 7) : undefined,
            onClick: path.isActive ? undefined : () => this._onTrackClick(path.entityIndex),
            segments: [{ points: path.points, opacity: path.isActive ? 1 : 0.8 }],
            markers: [],
        };
    }

    private _drawDayMarkers(): void {
        const engine = this._engine;
        if (!engine) return;
        this._dayHandles.forEach((handle) => handle.remove());
        this._dayHandles = [];

        const activeColor = this._activePath?.color ?? "var(--primary-color)";
        this._segments
            .filter((segment) => segment.type === "stay")
            .forEach((stay) => {
                const element = createStayMarker(stay.zoneIcon, 14, activeColor);
                this._dayHandles.push(
                    engine.addMarker(element, [stay.center.lat, stay.center.lon], { size: [22, 22], interactive: false }),
                );
            });

        if (this._showsDot) {
            this._dayHandles.push(
                engine.addMarker(createCurrentLocationDot(), this._locations[0].point, {
                    size: [20, 20],
                    interactive: false,
                    raised: true,
                }),
            );
        }
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
                animated: this._animateHighlightedPath ? { dash: 14, gap: 10 } : undefined,
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

    private _addPath(
        points: MapLatLng[],
        path: Omit<StyledMapPath, "segments" | "markers">,
        opacity: number,
        handles: MapItemHandle[],
    ): void {
        if (points.length < 2) return;
        handles.push(this._engine!.addPath({ ...path, segments: [{ points, opacity }], markers: [] }));
    }

    // MapLibre cannot read CSS variables.
    private _resolveColor(color: string): string {
        const variable = color.match(/^var\((--[\w-]+)\)$/)?.[1];
        return variable ? getComputedStyle(this).getPropertyValue(variable).trim() : color;
    }

    static styles = [
        HaMap.styles,
        css`
            timeline-ha-entity-marker::part(marker) {
                cursor: pointer;
            }
            timeline-ha-entity-marker[inactive] {
                filter: var(--ha-cluster-shadow, drop-shadow(0 1px 3px rgba(0, 0, 0, 0.12))) opacity(0.7);
            }
        `,
    ];
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

customElements.define("timeline-map", TimelineMap);
