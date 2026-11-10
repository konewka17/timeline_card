# Upgrading from v1 to v2

Home Assistant has recently made a lot of changes to
its [native map card](https://www.home-assistant.io/dashboards/map/), most notably the switch to a different mapping
engine. v2 of the timeline location card aligns its code to these changes, making it much easier in the future to bring
new features of the HA map to this card as well. As part of this major release, several configuration settings are
updated, this might require you to update a few options in the configuration of the card. v2 needs Home Assistant
**2026.11** or newer.

Everything that belongs to an entity is now set on that entity, in the `entities` list. There is no separate advanced
mode any more. In the visual editor, use the pencil next to an entity. The changes below that remove an option have to
be made in YAML: open the card and choose **Show code editor**.

## What to change

| Replace                           | with                             | Remarks                                                                              |
|-----------------------------------|----------------------------------|--------------------------------------------------------------------------------------|
| `entity`                          | `entities`                       | The `entity` option is deprecated: it still works for now, but will be removed later |
| `entity: person.alice`            | `entities:`<br/>`- person.alice` | Always a list, also with a single entity                                             |
| top-level `places_entity`         | `places_entity` on each entity   |
| `colors`                          | `color` on each entity           | Without it, the card's default colors are used.                                      |
| `icon` on an entity               | `label_mode: icon`               | Shows the entity's own icon on the map                                               |
| `map_appearance`                  | `theme_mode`                     | Values stay the same: `auto`, `light` or `dark`                                      |
| `map_tile_url`, `map_attribution` | Remove                           | The map uses HA's own map styles and tile proxy; see `map_style`.                    |
| `update_interval`                 | Remove                           | Today's timeline and map now update live                                             |

The other old options are ignored without a message: `colors` and `map_appearance` simply stop having effect until you
convert them.

## Example

v1:

```yaml
type: custom:location-timeline-card
entity:
  - person.alice
  - person.bob
places_entity:
  - sensor.places_alice
  - sensor.places_bob
colors:
  - "#e91e63"
  - "#2196f3"
map_appearance: dark
```

v2:

```yaml
type: custom:location-timeline-card
entities:
  - entity: person.alice
    places_entity: sensor.places_alice
    color: "#e91e63"
  - entity: person.bob
    places_entity: sensor.places_bob
    color: "#2196f3"
theme_mode: dark
```

A top-level `places_entity` list has the same order as the entity list, so the first sensor goes on the first entity,
and so on. The same goes for `colors`.

Also, the card now requires the `entities` option to be a list, so if you have configured your card with a single entity, reconfigure it as a list like so:
```yaml
type: custom:location-timeline-card
entity: person.alice
``` 
to
```yaml
type: custom:location-timeline-card
entities:
  - entity: person.alice
```

