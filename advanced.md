# Advanced Configuration

This document covers advanced YAML-only configuration options for the Location Timeline Card. These options are not available through the GUI editor — switch to the YAML editor to use them.

## Entity object syntax

Each item in the `entity` list can be a plain string (entity ID) or an object. The object form lets you attach an `activity_entity` or `places_entity` directly to a specific tracked entity.

### Object properties

| Property          | Required | Description                                                                                                                                                          |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`          | **Yes**  | The `device_tracker` or `person` entity ID.                                                                                                                          |
| `activity_entity` | No       | A `sensor` entity that tracks the current activity (e.g. walking, running, cycling). When set, move segments display the resolved activity name instead of "Moving". |
| `places_entity`   | No       | A `sensor` entity from the [Places integration](https://github.com/custom-components/places). Takes precedence over the top-level `places_entity` for this entity.   |
| `color`           | No       | An override color code (like `#ff0000`, `red`, or `var(--orange-color)`) specifically for this entity. Overrides global map display `colors` array.                  |

### Examples

**Simple — all entities as strings (works in GUI and YAML):**

```yaml
type: custom:location-timeline-card
entity:
    - person.alice
    - person.bob
```

**Object form — per-entity activity and places sensors:**

```yaml
type: custom:location-timeline-card
entity:
    - entity: person.alice
      activity_entity: sensor.alice_activity
      places_entity: sensor.places_alice
      color: "#e91e63"
    - entity: person.bob
      activity_entity: sensor.bob_activity
      places_entity: sensor.places_bob
      color: "#2196f3"
```

**Mixed — strings and objects together:**

```yaml
type: custom:location-timeline-card
entity:
    - person.alice
    - entity: person.bob
      activity_entity: sensor.bob_activity
```

### How `places_entity` resolution works

1. **Per-entity override** — If a `places_entity` is specified in the entity object, it is used directly for that entity.
2. **Top-level fallback** — If not specified per-entity, the card checks the top-level `places_entity` list and auto-matches by the `devicetracker_entityid` attribute on the Places sensor.

This means you can mix both approaches:

```yaml
type: custom:location-timeline-card
entity:
    - entity: person.alice
      places_entity: sensor.places_alice
    - person.bob
places_entity:
    - sensor.places_bob
```

## Activity Icons

When an `activity_entity` is provided, the card displays the current activity for "move" segments. You can customize the icons used for these activities using the `activity_icon_map` option.

### `activity_icon_map`

This is an object where keys are activity names (as reported by your activity sensor) and values are MDI icons.

| Property            | Type   | Description                                                                                               |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `activity_icon_map` | object | A map of activity names to icon strings (e.g., `walking: mdi:walk`). Falls back to zone icons or default. |

**Example:**

```yaml
type: custom:location-timeline-card
entity:
    - entity: person.alice
      activity_entity: sensor.alice_activity
activity_icon_map:
    Walking: mdi:walk
    Running: mdi:run
    Cycling: mdi:bike
    "In car": mdi:car
```

### GUI editor behavior

When entity objects are detected in the configuration, the GUI editor is automatically disabled and the card switches to YAML mode. To return to the GUI editor, convert all entity items back to plain strings and configure `places_entity` separately or remove it.
