import {commitment} from "@poi/core";
import {describe, expect, it} from "vitest";
import type {Address, Hex} from "viem";
import {buildRevealFile, checkReveal, revealFilename} from "../src/reveal";

const attester = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const uid = `0x${"3".repeat(64)}` as Hex;
const salt = `0x${"4".repeat(32)}` as Hex;
const base = buildRevealFile({
    chainId: 91342,
    attester,
    attestationUID: uid,
    tag: "DECISION",
    salt,
    payload: {text: "공개 내용"},
});
const expected = commitment(base);

describe("reveal", () => {
    it("올바른 salt와 payload가 일치한다", () => expect(checkReveal(base, expected)).toBe(true));
    it("payload 한 글자가 다르면 불일치한다", () => {
        expect(checkReveal({...base, payload: {text: "공개 내욘"}}, expected)).toBe(false);
    });
    it("salt가 다르면 불일치한다", () => {
        expect(checkReveal({...base, salt: `0x${"5".repeat(32)}`}, expected)).toBe(false);
    });
    it("CT18: attester만 다른 복사본은 불일치한다", () => {
        expect(checkReveal({...base, attester: other}, expected)).toBe(false);
    });
    it("version과 chainId를 채운다", () => {
        expect(base.version).toBe("poi.reveal.v1");
        expect(base.chainId).toBe(91342);
    });
    it("파일명 규칙을 따른다", () => {
        expect(revealFilename(base)).toBe(`${uid}.DECISION.json`);
    });
});
