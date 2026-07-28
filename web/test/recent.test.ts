import {describe, expect, it} from "vitest";
import {addRecent, removeRecent, type RecentDecision} from "../src/recent";

const item = (digit: number): RecentDecision => ({
    uid: `0x${String(digit).repeat(64)}`,
    at: digit,
});

describe("removeRecent", () => {
    it("removes only the selected UID, case-insensitively", () => {
        expect(removeRecent([item(1), item(2)], item(1).uid.toUpperCase())).toEqual([item(2)]);
    });
});

describe("addRecent", () => {
    it("puts the newest visit first and removes the previous visit to that UID", () => {
        expect(addRecent([item(1), item(2)], item(2).uid.toUpperCase(), 9)).toEqual([
            {uid: item(2).uid.toUpperCase(), at: 9},
            item(1),
        ]);
    });

    it("keeps at most five visits", () => {
        expect(addRecent([item(1), item(2), item(3), item(4), item(5)], item(6).uid, 6))
            .toEqual([item(6), item(1), item(2), item(3), item(4)]);
    });

    it("does not mutate its input", () => {
        const list = [item(1)];
        addRecent(list, item(2).uid, 2);
        expect(list).toEqual([item(1)]);
    });
});
