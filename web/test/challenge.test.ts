import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {filterActiveChallenges} from "../src/challenge";
import type {ChallengeLog} from "../src/read";

const uid = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const address = "0x1111111111111111111111111111111111111111" as Address;
const settlement = uid("9");
const log = (id: string, refUID = settlement, revocationTime = 0n): ChallengeLog => ({
    uid: uid(id), attester: address, refUID, revocationTime,
});

describe("filterActiveChallenges", () => {
    it("철회된 이의를 제외한다", () => expect(filterActiveChallenges([log("1"), log("2", settlement, 1n)], settlement).map((x) => x.uid)).toEqual([uid("1")]));
    it("다른 정산의 이의를 제외한다", () => expect(filterActiveChallenges([log("1"), log("2", uid("8"))], settlement).map((x) => x.uid)).toEqual([uid("1")]));
    it("입력 순서를 보존한다", () => expect(filterActiveChallenges([log("3"), log("1"), log("2")], settlement).map((x) => x.uid)).toEqual([uid("3"), uid("1"), uid("2")]));
});
