import assert from "node:assert/strict";
import test from "node:test";
import type {CandleRow} from "../src/metric.ts";
import {serializeSnapshot, snapshotHash} from "../src/snapshot.ts";

const rows: CandleRow[] = [
    ["2026-07-28T00:02:00", "102"],
    ["2026-07-28T00:01:00", "101"],
];

test("snapshot serialization has no whitespace", () => {
    assert.equal(
        serializeSnapshot(rows),
        '[["2026-07-28T00:01:00","101"],["2026-07-28T00:02:00","102"]]',
    );
});

test("snapshot serialization sorts rows by time", () => {
    assert.equal(serializeSnapshot(rows), serializeSnapshot([...rows].reverse()));
});

test("the same snapshot has a deterministic hash", () => {
    assert.equal(snapshotHash(rows), snapshotHash([...rows]));
});

test("a changed price changes the snapshot hash", () => {
    assert.notEqual(snapshotHash(rows), snapshotHash([[rows[0]![0], "103"], rows[1]!]));
});
