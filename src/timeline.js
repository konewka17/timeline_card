import {capitalizeFirst, escapeHtml, formatDistance, formatDuration, formatTimeRange} from "./utils.js";
import {localize} from "./localize/localize.js";

export function renderTimeline(segments, locale, config) {
    if (!segments || segments.length === 0) {
        return `<div class="empty">${localize("timeline.empty")}</div>`;
    }

    const entries = segments.map((segment, index) => ({segment, index}));
    if (config.reverse_timeline_order) {
        entries.reverse();
    }

    const firstIsStay = entries[0]?.segment?.type === "stay";
    const lastIsStay = entries[entries.length - 1]?.segment?.type === "stay";
    const timelineClass = ["timeline", firstIsStay ? "trim-spine-top" : "", lastIsStay ? "trim-spine-bottom" : ""];

    return `
    <div class="${timelineClass.join(" ")}">
      <div class="spine"></div>
      ${entries
          .map(({segment, index}) =>
              renderSegment(segment, index, {
                  locale: locale,
                  iconMap: config.activity_icon_map || {},
                  distanceUnit: config.distance_unit || "metric",
                  hideMoving: Boolean(config.hide_moving),
                  hideStartTime: index === 0 && segment.type === "stay",
                  hideEndTime: index === segments.length - 1 && segment.type === "stay",
              }),
          )
          .join("")}
    </div>
  `;
}

function renderSegment(segment, index, options) {
    if (segment.type === "stay") {
        return `
          <div class="entry stay" data-segment-index="${index}" data-segment-type="stay">
            <div class="left-icon">
              <div class="icon-ring">
                <ha-icon class="stay-icon" icon="${segment.zoneIcon || "mdi:map-marker"}"></ha-icon>
              </div>
            </div>
            <div class="line-slot">
              <div class="line-dot"></div>
            </div>
            <div class="content location">
              <div class="title">${escapeHtml(segment.zoneName || segment.placeName || localize("timeline.unknown_location"))}</div>
            </div>
            <div class="content time multiline">
              <div class="meta timerange">${formatTimeRange(segment.start, segment.end, options)}</div>
              ${options?.hideStartTime || options?.hideEndTime ? "" : `<div class="meta small duration">${formatDuration(segment.durationMs)}</div>`}
            </div>
          </div>
        `;
    }

    if (!options.hideMoving) {
        return `
          <div class="entry move" data-segment-index="${index}" data-segment-type="move">
            <div class="left-icon"></div>
            <div class="line-slot" data-segment-index="${index}">
              <div class="spine-overlay"></div>
            </div>
            <div class="content location travel">
              <ha-icon class="move-icon" icon="${segment.activityIcon || "mdi:chart-line-variant"}"></ha-icon>
              <div class="title">${escapeHtml(capitalizeFirst(segment.activityName || localize("timeline.moving")))}<span class="meta"> - ${formatDistance(segment.distanceM, options.distanceUnit)}</span></div>
            </div>
            <div class="content time">
              <div class="meta duration">${formatDuration(segment.durationMs)}</div>
            </div>
          </div>
        `;
    }
    return "";
}
