import {formatDistance, formatDuration, formatTime, formatTimeRange} from "./utils.js";

export function renderTimeline(segments) {
    if (!segments || segments.length === 0) {
        return `<div class="empty">No location history for this day.</div>`;
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
          hideStart: index === 0 && firstIsStay,
          hideEnd: index === segments.length - 1 && lastIsStay,
      })).join("")}
    </div>
  `;
}

function renderSegment(segment, index, {hideStart = false, hideEnd = false} = {}) {
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
          <div class="meta">${formatStayTime(segment.start, segment.end, {hideStart, hideEnd})}</div>
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
        <div class="title">Moving<span class="meta"> - ${formatDistance(segment.distanceM)}</span></div>
      </div>
      <div class="content time">
        <div class="meta">${formatDuration(segment.durationMs)}</div>
      </div>
    </div>
  `;
}

function formatStayTime(start, end, {hideStart = false, hideEnd = false} = {}) {
    if (hideStart && hideEnd) {
        return "all day";
    }

    if (hideStart && !hideEnd) {
        return formatTime(end);
    }

    if (hideEnd && !hideStart) {
        return formatTime(start);
    }

    return formatTimeRange(start, end);
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}
