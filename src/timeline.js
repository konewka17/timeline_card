import { formatDistance, formatDuration, formatTimeRange } from "./utils.js";

export function renderTimeline(segments) {
  if (!segments || segments.length === 0) {
    return `<div class="empty">No location history for this day.</div>`;
  }

  return `
    <div class="timeline">
      ${segments.map(renderSegment).join("")}
    </div>
  `;
}

function renderSegment(segment) {
  if (segment.type === "stay") {
    return `
      <div class="entry stay">
        <div class="marker">
          <ha-icon icon="mdi:map-marker-radius"></ha-icon>
        </div>
        <div class="content">
          <div><span class="title">${escapeHtml(segment.zoneName || "Unknown location")}</span> • ${renderCoords(segment)}</div>
          <div class="meta">${formatTimeRange(segment.start, segment.end)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="entry move">
      <div class="marker">
        <ha-icon icon="mdi:car"></ha-icon>
      </div>
      <div class="content">
        <div class="title">Travel</div>
        <div class="meta">${formatDuration(segment.durationMs)} • ${formatDistance(segment.distanceM)}</div>
      </div>
    </div>
  `;
}

function renderCoords(segment) {
  if (!segment.center) return "";
  const lat = segment.center.lat.toFixed(5);
  const lon = segment.center.lon.toFixed(5);
  return `<div class="coords">${lat}, ${lon}</div>`;
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
