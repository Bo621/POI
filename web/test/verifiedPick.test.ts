import {describe, expect, it} from "vitest";
import {pickValidVerification} from "../src/wallet";

/**
 * 도장 발급은 **철회가 실제로 일어난다** — 온체인에서 확인했다.
 * 철회·만료된 검증을 붙이면 컨트랙트가 발행 자체를 거부하므로,
 * 붙이지 않는 쪽이 옳다.
 */
const ISSUER = "0x09B170CA2A006081042992bCE7379B85a02149C6";
const OTHER = "0x1111111111111111111111111111111111111111";
const uid = (n: string) => `0x${n.repeat(64)}` as const;

describe("pickValidVerification", () => {
    const now = 1000n;
    it("철회된 것은 고르지 않는다", () => {
        expect(pickValidVerification([{uid: uid("1"), revocationTime: 5n, expirationTime: 0n, attester: ISSUER}], now, ISSUER)).toBeUndefined();
    });
    it("만료된 것은 고르지 않는다", () => {
        expect(pickValidVerification([{uid: uid("2"), revocationTime: 0n, expirationTime: 999n, attester: ISSUER}], now, ISSUER)).toBeUndefined();
    });
    it("발급자가 다르면 고르지 않는다", () => {
        expect(pickValidVerification([{uid: uid("3"), revocationTime: 0n, expirationTime: 0n, attester: OTHER}], now, ISSUER)).toBeUndefined();
    });
    it("유효한 것 중 가장 나중 것을 고른다", () => {
        const picked = pickValidVerification([
            {uid: uid("4"), revocationTime: 0n, expirationTime: 0n, attester: ISSUER},
            {uid: uid("5"), revocationTime: 0n, expirationTime: 0n, attester: ISSUER},
        ], now, ISSUER);
        expect(picked).toBe(uid("5"));
    });
    it("만료 시각이 0 이면 무기한으로 본다", () => {
        expect(pickValidVerification([{uid: uid("6"), revocationTime: 0n, expirationTime: 0n, attester: ISSUER}], now, ISSUER)).toBe(uid("6"));
    });
});
