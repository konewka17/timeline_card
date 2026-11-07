import {MAP_STYLES} from "./ha-frontend/src/common/map/map-styles";

// The form shows a default while the option is unset, so a toggle that defaults on shows on.
const withDefaults = (schema, defaults) =>
    schema.map((item) => ({
        ...item,
        ...(item.schema && {schema: withDefaults(item.schema, defaults)}),
        ...(defaults[item.name] !== undefined && typeof defaults[item.name] !== "object" && {default: defaults[item.name]}),
    }));

const label = (hass, name) =>
    hass.localize(`ui.panel.lovelace.editor.card.generic.${name}`) ||
    name.charAt(0).toUpperCase() + name.slice(1).split("_").join(" ");

const entityFields = (hass) =>
    Object.fromEntries(
        Object.entries({
            entity: {
                required: true,
                selector: {entity: {filter: [{domain: ["person", "device_tracker"]}]}},
            },
            name: {selector: {text: {}}},
            color: {selector: {ui_color: {}}},
            label_mode: {
                selector: {
                    select: {
                        mode: "dropdown",
                        options: ["state", "attribute", "icon"].map((mode) => ({
                            value: mode,
                            label: hass.localize(`ui.panel.lovelace.editor.card.map.label_modes.${mode}`) || mode,
                        })),
                    },
                },
            },
            attribute: {selector: {text: {}}},
            unit: {selector: {text: {}}},
            places_entity: {selector: {entity: {filter: [{domain: "sensor", integration: "places"}]}}},
            activity_entity: {selector: {entity: {filter: [{domain: "sensor"}]}}},
        }).map(([name, field]) => [name, {...field, label: label(hass, name)}]),
    );

const schema = (hass, defaults) =>
    withDefaults(
        [
            {
                name: "entity",
                required: true,
                selector: {object: {multiple: true, label_field: "entity", fields: entityFields(hass)}},
            },
            {
                type: "expandable",
                name: "",
                title: "Map display",
                icon: "mdi:map",
                flatten: true,
                schema: [
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {
                                name: "theme_mode",
                                selector: {select: {options: ["auto", "light", "dark"], mode: "dropdown"}},
                            },
                            {
                                name: "map_style",
                                selector: {select: {options: [...MAP_STYLES], mode: "dropdown"}},
                            },
                            {
                                name: "current_location_marker",
                                selector: {select: {options: ["default", "entity"], mode: "dropdown"}},
                            },
                            {name: "map_height_px", selector: {number: {unit_of_measurement: "px"}}},
                            {name: "default_zoom", selector: {number: {min: 1, max: 20, mode: "box"}}},
                        ],
                    },
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {name: "hide_current_location", selector: {boolean: {}}},
                            {name: "hide_unselected_on_map", selector: {boolean: {}}},
                            {name: "show_zones", selector: {boolean: {}}},
                            {name: "cluster", selector: {boolean: {}}},
                            {name: "scale_ruler", selector: {boolean: {}}},
                            {name: "animate_highlighted_path", selector: {boolean: {}}},
                        ],
                    },
                ],
            },
            {
                type: "expandable",
                name: "",
                title: "Timeline display",
                icon: "mdi:timeline-clock-outline",
                flatten: true,
                schema: [
                    {
                        name: "distance_unit",
                        selector: {select: {options: ["metric", "imperial"], mode: "dropdown"}},
                    },
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {name: "hide_moving", selector: {boolean: {}}},
                            {name: "reverse_timeline_order", selector: {boolean: {}}},
                            {name: "collapse_timeline", selector: {boolean: {}}},
                            {name: "timeline_use_entity_color", selector: {boolean: {}}},
                        ],
                    },
                    {
                        name: "activity_icon_map",
                        selector: {
                            object: {
                                keySchema: {selector: {text: {}}},
                                valueSchema: {selector: {icon: {}}},
                            },
                        },
                    },
                ],
            },
            {
                type: "expandable",
                name: "",
                title: "Location names",
                icon: "mdi:map-marker-question-outline",
                flatten: true,
                schema: [{name: "osm_api_key", selector: {text: {type: "email"}}}],
            },
            {
                type: "expandable",
                name: "",
                title: "Advanced",
                icon: "mdi:tune-variant",
                flatten: true,
                schema: [
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {name: "stay_radius_m", selector: {number: {min: 1, step: 1, mode: "box"}}},
                            {name: "min_stay_minutes", selector: {number: {min: 1, step: 1, mode: "box"}}},
                            {name: "max_reasonable_speed_kmh", selector: {number: {min: 0, step: 1, mode: "box"}}},
                            {
                                name: "update_interval",
                                selector: {number: {min: 0, step: 1, unit_of_measurement: "sec", mode: "box"}},
                            },
                        ],
                    },
                ],
            },
        ],
        defaults,
    );

const fireConfigChanged = (element, config) =>
    element.dispatchEvent(new CustomEvent("config-changed", {detail: {config}, bubbles: true, composed: true}));

class TimelineCardEditor extends HTMLElement {
    setConfig(config) {
        // The entity list edits objects only; plain ids become objects, as HA's map card editor migrates dark_mode.
        if (config.entity?.some((item) => typeof item === "string")) {
            config = {...config, entity: config.entity.map((item) => (typeof item === "string" ? {entity: item} : item))};
            fireConfigChanged(this, config);
        }
        this._config = config;
        this._render();
    }

    set hass(hass) {
        this._hass = hass;
        this._render();
    }

    _render() {
        if (!this._hass || !this._config) return;
        if (!this._form) {
            this._form = document.createElement("ha-form");
            this._form.schema = schema(this._hass, this.defaults);
            this._form.computeLabel = (item) => label(this._hass, item.name);
            this._form.addEventListener("value-changed", (ev) => fireConfigChanged(this, ev.detail.value));
            this.appendChild(this._form);
        }
        this._form.hass = this._hass;
        this._form.data = this._config;
    }
}

customElements.define("location-timeline-card-editor", TimelineCardEditor);
