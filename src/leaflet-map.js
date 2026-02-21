import Leaflet from "leaflet";

const DEFAULT_CENTER = [52.3731339, 4.8903147];
const DEFAULT_ZOOM = 13;

export const setupLeafletMap = (mapElement) => {
    if (!mapElement?.isConnected) {
        throw new Error("Cannot setup Leaflet map on disconnected element");
    }

    const map = Leaflet.map(mapElement, {
        zoomControl: true,
    });

    const tileLayer = createTileLayer(Leaflet).addTo(map);
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    requestAnimationFrame(() => map.invalidateSize());

    return [map, Leaflet, tileLayer];
};

export const replaceTileLayer = (leaflet, map, tileLayer) => {
    if (tileLayer) {
        map.removeLayer(tileLayer);
    }
    const nextLayer = createTileLayer(leaflet);
    nextLayer.addTo(map);
    return nextLayer;
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
