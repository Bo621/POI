import {describe, expect, it} from "vitest";
import {canProceed} from "../src/saltBackup";

describe("canProceed", () => {
    it("백업 확인 전에는 진행하지 못한다", () => {
        expect(canProceed({confirmed: false})).toBe(false);
    });

    it("백업을 확인하면 진행할 수 있다", () => {
        expect(canProceed({confirmed: true})).toBe(true);
    });
});
