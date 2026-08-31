import {test} from "node:test";
import assert from "node:assert/strict";
import {findNearestSegmentIndex} from "../src/utils.js";

test("findNearestSegmentIndex resolves a click to the nearest tagged vertex", () => {
    const points = [{point: [51.5, -0.1]}, {point: [51.5, -0.3]}, {point: [51.7, -0.3]}];
    const segmentIndices = [0, 1, 2];
    assert.equal(findNearestSegmentIndex(points, segmentIndices, {lat: 51.49, lng: -0.11}), 0);
    assert.equal(findNearestSegmentIndex(points, segmentIndices, {lat: 51.51, lng: -0.29}), 1);
    assert.equal(findNearestSegmentIndex(points, segmentIndices, {lat: 51.71, lng: -0.31}), 2);
});
