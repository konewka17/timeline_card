import { LeafletMapEngine } from "../ha-frontend/src/common/map/engines/leaflet-map-engine";
import { animatePathDash, type StyledMapPath } from "./path-style";

export class StyledLeafletEngine extends LeafletMapEngine {
    private _drawPath(path: StyledMapPath) {
        const items = super._drawPath(path);
        const map = this.leafletMap!;
        const lines = items.filter((item) => item instanceof this.Leaflet!.Polyline);
        const markers = items.filter((item) => !lines.includes(item));

        const borders = path.border
            ? lines.map((line) =>
                  this.Leaflet!.polyline(line.getLatLngs(), {
                      color: path.border!.color,
                      weight: path.border!.width,
                      opacity: line.options.opacity,
                      interactive: false,
                  }).addTo(map),
              )
            : [];

        // Leaflet reads `interactive` when a layer is added, and this also puts the lines above their border.
        lines.forEach((line) => {
            line.remove();
            Object.assign(line.options, {
                weight: path.width ?? 3,
                dashArray: path.animated ? `${path.animated.dash} ${path.animated.gap}` : undefined,
                lineCap: path.animated ? "butt" : "round",
                interactive: Boolean(path.onClick),
            });
            line.addTo(map);
            if (path.onClick) {
                line.on("click", () => path.onClick!());
            }
        });
        markers.forEach((marker) => marker.bringToFront());

        const stopDash = path.animated
            ? animatePathDash(path.animated, (offset) =>
                  lines.forEach((line) => line.setStyle({ dashOffset: `${-offset}` })),
              )
            : undefined;

        return [...borders, ...items, { remove: () => stopDash?.() }];
    }
}
