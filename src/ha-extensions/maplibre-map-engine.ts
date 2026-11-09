import type { LayerSpecification } from "maplibre-gl";
import type { MapPathHandle } from "../ha-frontend/src/common/map/map-engine";
import { MapLibreMapEngine } from "../ha-frontend/src/common/map/engines/maplibre-map-engine";
import { animatePathDash, type PathDash, type StyledMapPath } from "./path-style";

export class StyledMapLibreEngine extends MapLibreMapEngine {
    private _pathsBeingAdded = new Map<string, StyledMapPath>();

    public addPath(path: StyledMapPath): MapPathHandle {
        if (!this._map) {
            return super.addPath(path);
        }
        const map = this._map;
        // HA's own id for the path it is about to add.
        const id = `ha-map-path-${this._idCounter}`;
        const lineLayerId = `${id}-lines`;

        this._pathsBeingAdded.set(lineLayerId, path);
        const handle = super.addPath(path);
        this._pathsBeingAdded.delete(lineLayerId);

        const onLineClick = () => path.onClick?.();
        const onLineEnter = () => {
            map.getCanvas().style.cursor = "pointer";
        };
        const onLineLeave = () => {
            map.getCanvas().style.cursor = "";
        };
        if (path.onClick) {
            map.on("click", lineLayerId, onLineClick);
            map.on("mouseenter", lineLayerId, onLineEnter);
            map.on("mouseleave", lineLayerId, onLineLeave);
        }
        const { animated } = path;
        const stopDash = animated
            ? animatePathDash(animated, (offset) => {
                  if (map.getLayer(lineLayerId)) {
                      map.setPaintProperty(lineLayerId, "line-dasharray", dashArray(animated, offset, path.width ?? 3));
                  }
              })
            : undefined;

        return {
            update: handle.update,
            remove: () => {
                map.off("click", lineLayerId, onLineClick);
                map.off("mouseenter", lineLayerId, onLineEnter);
                map.off("mouseleave", lineLayerId, onLineLeave);
                stopDash?.();
                this._removeCustomLayer(`${id}-border`);
                handle.remove();
            },
        };
    }

    // HA's addPath adds its line layer through here; the border has to go in just before it.
    private _addCustomLayer(layer: LayerSpecification): void {
        const path = this._pathsBeingAdded.get(layer.id);
        if (!path) {
            super._addCustomLayer(layer);
            return;
        }
        if (path.border) {
            super._addCustomLayer({
                id: layer.id.replace(/-lines$/, "-border"),
                type: "line",
                source: layer.source,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: {
                    "line-color": path.border.color,
                    "line-width": path.border.width,
                    "line-opacity": ["get", "opacity"],
                },
            });
        }
        const width = path.width ?? 3;
        super._addCustomLayer({
            ...layer,
            layout: { "line-cap": path.animated ? "butt" : "round", "line-join": "round" },
            paint: {
                ...layer.paint,
                "line-width": width,
                ...(path.animated && { "line-dasharray": dashArray(path.animated, 0, width) }),
            },
        });
    }
}

// No dash offset in MapLibre; the shifted pattern is spelled out per step, in line widths.
// Butt caps: a shifted pattern can start with a zero-length dash, which round caps draw as a dot.
const dashArray = ({ dash, gap }: PathDash, offset: number, width: number) =>
    (offset <= gap ? [0, offset, dash, gap - offset] : [offset - gap, gap, dash + gap - offset, 0]).map(
        (length) => length / width,
    );
