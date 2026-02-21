import {formatDistance, formatDuration, formatTimeRange} from "./utils.js";
import {t} from "./localization.js";

export function renderTimeline(segments, localeContext) {
    if (!segments || segments.length === 0) {
        return `<div class="empty">${t(localeContext, "noHistory")}</div>`;
    }

    const firstIsStay = segments[0]?.type === "stay";
    const lastIsStay = segments[segments.length - 1]?.type === "stay";
    const timelineClass = [
        "timeline",
        firstIsStay ? "trim-spine-top" : "",
        lastIsStay ? "trim-spine-bottom" : "",
    ].join(" ");

    return `
    <div class="${timelineClass}">
      <div class="spine"></div>
      ${segments.map((segment, index) => renderSegment(segment, index, {
        hideStartTime: index === 0 && firstIsStay,
        hideEndTime: index === segments.length - 1 && lastIsStay,
    }, localeContext)).join("")}
    </div>
  `;
}

function renderSegment(segment, index, options, localeContext) {
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
              <div class="title">${escapeHtml(segment.zoneName || segment.placeName || "Unknown location")}</div>
            </div>
            <div class="content time">
              <div class="meta">${formatTimeRange(segment.start, segment.end, options, localeContext)}</div>
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
        <div class="title">${t(localeContext, "moving")}<span class="meta"> - ${formatDistance(segment.distanceM)}</span></div>
      </div>
      <div class="content time">
        <div class="meta">${formatDuration(segment.durationMs, localeContext)}</div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}
