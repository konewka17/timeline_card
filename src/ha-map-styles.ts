// Port of the static styles of ha-map.ts (HA frontend, see src/ha-frontend/UPSTREAM); its :host rule is left out,
// and the marker tag is timeline-entity-marker.
import { editableCircleStyles } from "./ha-frontend/src/common/map/editable-circle";
import { zoneMarkerStyles } from "./ha-frontend/src/common/map/zone-marker";

export const CLUSTER_AVATAR_SIZE = 32;
export const CLUSTER_BUBBLE_PADDING = 6;
export const CLUSTER_BUBBLE_GAP = 4;
export const CLUSTER_MORE_WIDTH = 28;
export const CLUSTER_TAIL_SIZE = 10;

export const haMapStyles = `
  #map {
    height: 100%;
    /* The map arrives in one piece: the container carries the cartography's
       own ground, and fades in with the markers once a frame is drawn */
    background-color: #f4efe6;
    /* Hidden rather than transparent: the controls and markers in here are
       not to be clicked or tabbed to before they are on screen */
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--ha-animation-duration-fast, 150ms) ease-in;
    /* A cluster bubble and its tail cast a single shadow around their
       combined silhouette (drop-shadow on the wrapper), so no shadow seam
       appears between the bubble and its tail. */
    --ha-cluster-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08))
      drop-shadow(0 1px 3px rgba(0, 0, 0, 0.12));
  }
  #map.drawn {
    visibility: visible;
    opacity: 1;
  }
  #map.clickable {
    cursor: pointer;
  }
  .maplibregl-marker {
    transition:
      opacity var(--ha-animation-duration-fast),
      visibility var(--ha-animation-duration-fast);
  }
  .maplibregl-marker-covered {
    visibility: hidden;
    pointer-events: none;
  }
  /* A zone fades in once the bubble over it is opaque, not through it */
  .zone-circle:not(.maplibregl-marker-covered) {
    transition-delay: var(--ha-animation-duration-fast);
  }
  #map.dark {
    background: #191b2c;
    --ha-cluster-shadow: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))
      drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  }
  #map.forced-dark {
    color: #ffffff;
    --map-filter: invert(0.9) hue-rotate(170deg) brightness(1.5) contrast(1.2)
      saturate(0.3);
  }
  #map.forced-light {
    background: #ffffff;
    color: #000000;
    --map-filter: invert(0);
  }
  /* Zoomed out the sky fades out and the globe is left on a transparent
     canvas, so what surrounds it is this element. The same sky in both
     themes, day or night: a glow where the sphere sits at the widest zoom
     out -- MapLibre's own atmosphere carries the edge from there in -- over
     a gradient that lightens towards the top. */
  #map.space {
    --ha-map-space-glow: rgba(255, 255, 255, 0.95);
    --ha-map-space-haze: rgba(255, 255, 255, 0.45);
    --ha-map-space-fade: rgba(255, 255, 255, 0);
    --ha-map-space-high: #dbe8f8;
    --ha-map-space-low: #7aa5d3;
    background-color: var(--ha-map-space-low);
    background-image:
      radial-gradient(
        circle at 50% 50%,
        var(--ha-map-space-glow) 18%,
        var(--ha-map-space-haze) 24%,
        var(--ha-map-space-fade) 34%
      ),
      linear-gradient(
        180deg,
        var(--ha-map-space-high) 0%,
        var(--ha-map-space-low) 100%
      );
    background-repeat: no-repeat;
  }
  #map.space.dark {
    --ha-map-space-glow: rgba(126, 158, 224, 0.5);
    --ha-map-space-haze: rgba(86, 110, 170, 0.22);
    --ha-map-space-fade: rgba(86, 110, 170, 0);
    --ha-map-space-high: #141a30;
    --ha-map-space-low: #05060f;
  }
  #map.clickable:active,
  #map:active {
    cursor: grabbing;
  }
  /* The tail is a rotated square whose upper half sits under the bubble;
     drawn behind it, so it never covers an avatar's frame or selected ring */
  .cluster-bubble-tail {
    position: relative;
    z-index: -1;
  }
  /* Only the raster fallback is inverted for dark mode, the vector style
     ships its own dark cartography. */
  .leaflet-tile-pane .leaflet-tile {
    filter: var(--map-filter);
  }
  /* The Leaflet fallback with WebGL2 renders vectors through the adapter
     without MapLibre's stylesheet; these are the only two rules its canvas
     needs. */
  .maplibregl-map {
    position: relative;
    overflow: hidden;
  }
  .maplibregl-canvas {
    position: absolute;
    top: 0;
    left: 0;
  }
  .maplibregl-ctrl-bottom-left,
  .maplibregl-ctrl-bottom-right {
    /* Lets a card keep the attribution and scale clear of an overlay */
    margin-bottom: var(--ha-map-bottom-inset, 0);
  }
  .maplibregl-ctrl-top-left,
  .maplibregl-ctrl-bottom-left {
    margin-left: var(--ha-map-left-inset, 0);
  }
  .maplibregl-ctrl-top-right,
  .maplibregl-ctrl-bottom-right {
    margin-right: var(--ha-map-right-inset, 0);
  }
  .dark .maplibregl-ctrl.maplibregl-ctrl-group {
    background-color: #1c1c1c;
  }
  .dark .maplibregl-ctrl-group button + button {
    border-top-color: #313131;
  }
  .dark .maplibregl-ctrl button .maplibregl-ctrl-icon {
    filter: invert(1);
  }
  /* Not inherited from the page, which may be in the other mode */
  .maplibregl-ctrl.maplibregl-ctrl-attrib {
    color: #000000;
  }
  .dark .maplibregl-ctrl.maplibregl-ctrl-attrib {
    background-color: rgba(28, 28, 28, 0.6);
    color: #ffffff;
  }
  .dark .maplibregl-ctrl-attrib.maplibregl-compact {
    background-color: #1c1c1c;
  }
  .dark .maplibregl-ctrl-attrib a {
    color: rgba(255, 255, 255, 0.85);
  }
  .dark .maplibregl-ctrl-attrib-button {
    filter: invert(1);
  }
  /* MapLibre's stylesheet, linked into this root, wins on equal specificity */
  .maplibregl-popup-content {
    padding: 8px !important;
    font-size: var(--ha-font-size-s);
    font-family: var(--ha-font-family-body);
    background: rgba(80, 80, 80, 0.9) !important;
    color: white !important;
    border-radius: var(--ha-border-radius-sm) !important;
    box-shadow: none !important;
    text-align: center;
  }
  .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
    border-top-color: rgba(80, 80, 80, 0.9) !important;
  }
  .maplibregl-popup-anchor-top .maplibregl-popup-tip {
    border-bottom-color: rgba(80, 80, 80, 0.9) !important;
  }
  .maplibregl-ctrl-bottom-left {
    direction: ltr;
  }
  .dark .leaflet-bar a {
    background-color: #1c1c1c;
    color: #ffffff;
  }
  .dark .leaflet-bar a:hover {
    background-color: #313131;
  }
  ${editableCircleStyles}
  .named-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
    color: var(--primary-text-color);
  }
  .leaflet-pane {
    z-index: 0 !important;
  }
  .cluster-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
    isolation: isolate;
    filter: var(--ha-cluster-shadow);
  }
  /* The wrapper carries the shadow around the bubble-plus-tail outline, so
     the bubble itself drops its own to avoid a seam at the tail. */
  .cluster-marker .cluster-bubble {
    filter: none;
  }
  .cluster-bubble-tail {
    width: ${CLUSTER_TAIL_SIZE}px;
    height: ${CLUSTER_TAIL_SIZE}px;
    margin-top: ${-CLUSTER_TAIL_SIZE / 2}px;
    border-radius: 2px;
    background: var(--card-background-color, #fff);
    transform: rotate(45deg);
  }
  .cluster-bubble {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    gap: ${CLUSTER_BUBBLE_GAP}px;
    padding: ${CLUSTER_BUBBLE_PADDING}px;
    box-sizing: border-box;
    background: var(--card-background-color, #fff);
    border-radius: 14px;
    filter: var(--ha-cluster-shadow);
    --ha-marker-size: ${CLUSTER_AVATAR_SIZE}px;
    --ha-marker-selected-scale: 1;
    --ha-marker-color: transparent;
    --ha-marker-border-width: 1px;
    --ha-marker-font-size: var(--ha-font-size-s);
    /* distinguish letter tiles from the bubble background */
    --ha-marker-background: var(--ha-color-fill-neutral-quiet-resting);
  }
  .cluster-bubble .more {
    flex: none;
    width: ${CLUSTER_MORE_WIDTH}px;
    height: ${CLUSTER_AVATAR_SIZE}px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: var(--ha-color-fill-neutral-quiet-resting, #f0f0f0);
    color: var(--primary-text-color, #212121);
    font-size: var(--ha-font-size-s);
    font-weight: var(--ha-font-weight-medium);
  }
  .cluster-bubble timeline-entity-marker {
    flex: none;
  }
  ${zoneMarkerStyles}
  .leaflet-bottom {
    /* Lets a card keep the attribution and scale clear of an overlay */
    margin-bottom: var(--ha-map-bottom-inset, 0);
  }
  .leaflet-left {
    margin-left: var(--ha-map-left-inset, 0);
  }
  .leaflet-right {
    margin-right: var(--ha-map-right-inset, 0);
  }
  .leaflet-control,
  .leaflet-top,
  .leaflet-bottom {
    z-index: 1 !important;
  }
  .leaflet-control-scale {
    cursor: unset !important;
  }
  .leaflet-control-scale-line {
    --scale-ruler-color: var(--ha-color-on-surface-default);
    --scale-ruler-surface: var(--ha-color-surface-default);
    font-size: var(--ha-font-size-s);
    font-family: var(--ha-font-family-body);
    color: var(--scale-ruler-color) !important;
    background: color-mix(
      in srgb,
      var(--scale-ruler-surface) 80%,
      transparent
    ) !important;
    text-shadow: none !important;
    direction: ltr;
  }
  /* the theme tokens follow the page, so forced modes need the opposite values */
  #map.forced-light .leaflet-control-scale-line {
    --scale-ruler-color: var(--ha-color-neutral-05);
    --scale-ruler-surface: var(--ha-color-white);
  }
  #map.forced-dark .leaflet-control-scale-line {
    --scale-ruler-color: var(--ha-color-neutral-95);
    --scale-ruler-surface: var(--ha-color-neutral-10);
  }
  .leaflet-left .leaflet-control-scale {
    margin-left: 10px !important;
  }
  .leaflet-bottom .leaflet-control-scale {
    margin-bottom: 10px !important;
  }
  .leaflet-tooltip {
    padding: 8px;
    font-size: var(--ha-font-size-s);
    background: rgba(80, 80, 80, 0.9) !important;
    color: white !important;
    border-radius: var(--ha-border-radius-sm);
    box-shadow: none !important;
    text-align: center;
  }
`;
