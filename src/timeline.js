import {escapeHtml, formatDistance, formatDuration, formatTimeRange} from "./utils.js";
import {localize} from "./localize/localize.js";

export function renderTimeline(segments, locale, distance_unit) {
    if (!segments || segments.length === 0) {
        return `<div class="empty">${localize("timeline.empty")}</div>`;
    }

    const firstIsStay = segments[0]?.type === "stay";
    const lastIsStay = segments[segments.length - 1]?.type === "stay";
    const timelineClass = ["timeline", firstIsStay ? "trim-spine-top" : "", lastIsStay ? "trim-spine-bottom" : ""]

    return `
    <div class="${timelineClass.join(" ")}">
      <div class="spine"></div>
      ${segments.map((segment, index) => renderSegment(segment, index, {
        locale: locale,
        distanceUnit: distance_unit || "metric",
        hideStartTime: index === 0 && firstIsStay,
        hideEndTime: index === segments.length - 1 && lastIsStay,
    })).join("")}
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
            <div class="content time">
              <div class="meta">${formatTimeRange(segment.start, segment.end, options)}</div>
            </div>
          </div>
        `;
    }

    return `
    <div class="entry move" data-segment-index="${index}" data-segment-type="move">
      <div class="left-icon"></div>
      <div class="line-slot"></div>
      <div class="content location travel">
        <ha-icon class="move-icon" icon="mdi:chart-line-variant"></ha-icon>
        <div class="title">${localize("timeline.moving")}<span class="meta"> - ${formatDistance(segment.distanceM, options.distanceUnit)}</span></div>
      </div>
      <div class="content time">
        <div class="meta">${formatDuration(segment.durationMs)}</div>
      </div>
    </div>
  `;
}
