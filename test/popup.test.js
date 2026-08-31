import {test} from "node:test";
import assert from "node:assert/strict";
import {buildStayPopupHtml, isSameCalendarDay} from "../src/utils.js";

test("isSameCalendarDay returns true for two Date objects on the same day", () => {
    assert.equal(isSameCalendarDay(new Date("2026-08-21T09:00:00"), new Date("2026-08-21T17:30:00")), true);
});

test("isSameCalendarDay returns false across a day boundary", () => {
    assert.equal(isSameCalendarDay(new Date("2026-08-21T23:50:00"), new Date("2026-08-22T00:10:00")), false);
});

test("buildStayPopupHtml includes the place name and omits the date line for a same-day stay", () => {
    const html = buildStayPopupHtml(
        {start: new Date("2026-08-21T09:00:00"), end: new Date("2026-08-21T10:00:00"), zoneName: "Home"},
        null,
    );
    assert.match(html, /Home/);
    assert.doesNotMatch(html, /timeline-popup-date/);
});

test("buildStayPopupHtml includes the date line for a stay spanning midnight", () => {
    const html = buildStayPopupHtml(
        {start: new Date("2026-08-21T23:50:00"), end: new Date("2026-08-22T00:10:00"), zoneName: "Home"},
        null,
    );
    assert.match(html, /timeline-popup-date/);
});

test("buildStayPopupHtml escapes HTML in an untrusted place name", () => {
    const html = buildStayPopupHtml(
        {
            start: new Date("2026-08-21T09:00:00"),
            end: new Date("2026-08-21T10:00:00"),
            zoneName: "<img src=x onerror=alert(1)>",
        },
        null,
    );
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
});

test("buildStayPopupHtml renders an actual start-finish time range", () => {
    const html = buildStayPopupHtml(
        {start: new Date("2026-08-21T09:05:00"), end: new Date("2026-08-21T17:30:00"), zoneName: "Home"},
        {language: "en", time_format: "24"},
    );
    assert.match(html, /timeline-popup-time">[^<]*\d[^<]*-[^<]*\d[^<]*</);
});

test("buildStayPopupHtml falls back to the same unknown-location label as the timeline row", () => {
    const html = buildStayPopupHtml(
        {start: new Date("2026-08-21T09:00:00"), end: new Date("2026-08-21T10:00:00")},
        null,
    );
    assert.match(html, /timeline-popup-place">Unknown location</);
});

test("buildStayPopupHtml hides the start time for the first stay of the day", () => {
    const html = buildStayPopupHtml(
        {start: new Date("2026-08-21T00:00:00"), end: new Date("2026-08-21T09:14:00"), zoneName: "Home"},
        {language: "en", time_format: "24"},
        {hideStartTime: true},
    );
    const timeMatch = html.match(/timeline-popup-time">([^<]*)</);
    assert.ok(timeMatch, "time div should be present");
    assert.doesNotMatch(timeMatch[1], /-/);
});
