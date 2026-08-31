import {test} from "node:test";
import assert from "node:assert/strict";
import {isSolePanelViewCard} from "../src/utils.js";

test("isSolePanelViewCard is true only for the exact hui-card/hui-panel-view pairing", () => {
    assert.equal(isSolePanelViewCard("HUI-CARD", "HUI-PANEL-VIEW"), true);
});

test("isSolePanelViewCard is false for masonry/sections embeddings", () => {
    assert.equal(isSolePanelViewCard("HUI-CARD", "HUI-MASONRY-VIEW"), false);
    assert.equal(isSolePanelViewCard("HUI-CARD", "HUI-SECTION"), false);
    assert.equal(isSolePanelViewCard(undefined, undefined), false);
});
