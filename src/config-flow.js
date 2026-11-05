import {MAP_STYLES} from "./ha-frontend/src/common/map/map-styles";

// The form shows a default while the option is unset, so a toggle that defaults on shows on.
const withDefaults = (schema, defaults) =>
    schema.map((item) => ({
        ...item,
        ...(item.schema && {schema: withDefaults(item.schema, defaults)}),
        ...(defaults[item.name] !== undefined && typeof defaults[item.name] !== "object" && {default: defaults[item.name]}),
    }));

export function getConfigFormSchema(defaults) {
    return {
        schema: withDefaults([
            {
                name: "entity",
                required: true,
                selector: {
                    entity: {
                        multiple: true,
                        filter: [{domain: ["person", "device_tracker"]}],
                    },
                },
            },
            {
                type: "expandable",
                name: "",
                title: "Reverse geocoding",
                flatten: true,
                schema: [
                    {
                        name: "places_entity",
                        selector: {
                            entity: {
                                multiple: true,
                                filter: [{domain: "sensor", integration: "places"}],
                            },
                        },
                    },
                    {name: "osm_api_key", selector: {text: {type: "email"}}},
                ],
            },
            {
                type: "expandable",
                name: "",
                title: "Detection parameters",
                flatten: true,
                schema: [
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {
                                name: "stay_radius_m",
                                selector: {number: {min: 1, step: 1, mode: "box"}},
                            },
                            {
                                name: "min_stay_minutes",
                                selector: {number: {min: 1, step: 1, mode: "box"}},
                            },
                            {
                                name: "max_reasonable_speed_kmh",
                                selector: {number: {min: 0, step: 1, mode: "box"}},
                            },
                        ],
                    },
                ],
            },
            {
                type: "expandable",
                name: "",
                title: "Map display",
                flatten: true,
                schema: [
                    {
                        type: "grid",
                        name: "",
                        flatten: true,
                        schema: [
                            {
                                name: "theme_mode",
                                selector: {
                                    select: {
                                        options: ["auto", "light", "dark"],
                                        mode: "dropdown",
                                    },
                                },
                            },
                            {
                                name: "map_style",
                                selector: {
                                    select: {
                                        options: [...MAP_STYLES],
                                        mode: "dropdown",
                                    },
                                },
                            },
                            {
                                name: "current_location_marker",
                                selector: {
                                    select: {
                                        options: ["default", "entity"],
                                        mode: "dropdown",
                                    },
                                },
                            },
                            {
                                name: "map_height_px",
                                selector: {number: {unit_of_measurement: "px"}},
                            },
                            {
                                name: "default_zoom",
                                selector: {number: {min: 1, max: 20, mode: "box"}},
                            },
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
                flatten: true,
                schema: [
                    {
                        name: "distance_unit",
                        selector: {
                            select: {options: ["metric", "imperial"], mode: "dropdown"},
                        },
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
                title: "Updates",
                flatten: true,
                schema: [
                    {
                        name: "update_interval",
                        selector: {number: {min: 0, step: 1, unit_of_measurement: "sec", mode: "box"}},
                    },
                ],
            },
        ], defaults),
        assertConfig: (config) => {
            const entities = Array.isArray(config.entity) ? config.entity : [];
            if (entities.some((e) => e && typeof e === "object")) {
                throw new Error("Entity objects must be configured in YAML mode.");
            }
        },
    };
}
