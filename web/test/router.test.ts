import {describe, expect, test} from "vitest";
import {parseRoute, routeToHash, type Route} from "../src/router";

const UID = `0x${"ab".repeat(32)}`;
const ADDRESS = `0x${"ab".repeat(20)}`;

describe("parseRoute", () => {
    test("빈 해시와 루트는 home이다", () => {
        for (const hash of ["", "#", "#/"]) {
            expect(parseRoute(hash)).toEqual({name: "home"});
        }
    });

    test("고정 경로를 파싱한다", () => {
        expect(parseRoute("#/record")).toEqual({name: "record"});
        expect(parseRoute("#/me")).toEqual({name: "me"});
        expect(parseRoute("#/verify")).toEqual({name: "verify"});
        expect(parseRoute("#/fixtures")).toEqual({name: "fixtures"});
    });

    test("64자리 hex UID를 보존한다", () => {
        expect(parseRoute(`#/d/${UID}`)).toEqual({name: "decision", uid: UID});
    });

    test("짧은 UID를 거부한다", () => {
        expect(parseRoute("#/d/0x123")).toEqual({name: "notFound", raw: "#/d/0x123"});
    });

    test("hex가 아닌 UID를 거부한다", () => {
        const hash = `#/d/0x${"zz".repeat(32)}`;
        expect(parseRoute(hash)).toEqual({name: "notFound", raw: hash});
    });

    test("40자리 hex 주소를 파싱한다", () => {
        expect(parseRoute(`#/passport/${ADDRESS}`)).toEqual({name: "passport", address: ADDRESS});
    });

    test("짧은 주소를 거부한다", () => {
        const hash = "#/passport/0x12";
        expect(parseRoute(hash)).toEqual({name: "notFound", raw: hash});
    });

    test("알 수 없는 경로의 raw를 보존한다", () => {
        expect(parseRoute("#/없는경로")).toEqual({name: "notFound", raw: "#/없는경로"});
    });

    test("유효한 경로는 hash로 왕복한다", () => {
        const hashes = ["#/", "#/record", "#/me", `#/d/${UID}`, "#/verify", `#/passport/${ADDRESS}`, "#/fixtures"];
        for (const hash of hashes) {
            expect(routeToHash(parseRoute(hash))).toBe(hash);
        }
    });

    test("UID와 주소를 소문자로 정규화하고 대소문자 없이 비교한다", () => {
        const upperUID = UID.toUpperCase().replace("0X", "0x");
        const upperAddress = ADDRESS.toUpperCase().replace("0X", "0x");
        const decision = parseRoute(`#/d/${upperUID}`);
        const passport = parseRoute(`#/passport/${upperAddress}`);

        expect(decision).toEqual({name: "decision", uid: UID});
        expect(passport).toEqual({name: "passport", address: ADDRESS});
        expect(routeToHash(decision as Route)).toBe(`#/d/${UID}`);
        expect(routeToHash(passport as Route)).toBe(`#/passport/${ADDRESS}`);
    });
});
