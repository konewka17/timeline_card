export function getConfigFormSchema() {
    return {
        schema: [
            {
                name: "entity",
                required: true,
                selector: {entity: {multiple: true, filter: [{domain: ["person", "device_tracker"]}]}},
            },
            {
                type: "expandable",
                name: "",
                title: "Reverse geocoding",
                flatten: true,
                schema: [
                    {
                        name: "places_entity",
                        selector: {entity: {multiple: true, filter: [{domain: "sensor", integration: "places"}]}},
                    },
                    {name: "activity_entity", selector: {entity: {multiple: true, filter: [{domain: "sensor"}]}}},
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
                            {name: "stay_radius_m", selector: {number: {min: 1, step: 1, mode: "box"}}},
                            {name: "min_stay_minutes", selector: {number: {min: 1, step: 1, mode: "box"}}},
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
                                name: "distance_unit",
                                selector: {select: {options: ["metric", "imperial"], mode: "dropdown"}},
                            },
                            {
                                name: "map_appearance",
                                selector: {select: {options: ["auto", "light", "dark"], mode: "dropdown"}},
                            },
                        ],
                    },
                    {name: "map_height_px", selector: {number: {unit_of_measurement: "px"}}},
                    {name: "colors", selector: {text: {multiple: true}}},
                ],
            },
        ],
    };
}
