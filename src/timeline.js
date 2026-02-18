import { formatDistance, formatDuration, formatTimeRange } from "./utils.js";

export function renderTimeline(segments) {
  if (!segments || segments.length === 0) {
    return `<div class="empty">No location history for this day.</div>`;
  }

  return `
    <div class="timeline">
      <div class="spine"></div>
      ${segments.map(renderSegment).join("")}
    </div>
  `;
}

function renderSegment(segment) {
  if (segment.type === "stay") {
    return `
      <div class="entry stay">
        <div class="left-icon">
          <div class="icon-ring">
            <ha-icon class="stay-icon" icon="${segment.zoneIcon || "mdi:map-marker"}"></ha-icon>
          </div>
        </div>
        <div class="line-slot">
          <div class="line-dot"></div>
        </div>
        <div class="content location">
          <div class="title">${escapeHtml(segment.zoneName || "Unknown location")}</div>
        </div>
        <div class="content time">
          <div class="meta">${formatTimeRange(segment.start, segment.end)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="entry move">
      <div class="left-icon"></div>
      <div class="line-slot"></div>
      <div class="content location travel">
        <ha-icon class="move-icon" icon="mdi:car"></ha-icon>
        <div class="title">Travel <span class="meta">- ${formatDistance(segment.distanceM)}</span></div>
      </div>
      <div class="content time">
        <div class="meta">${formatDuration(segment.durationMs)}</div>
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
    .replaceAll('"', "&quot;");
}
