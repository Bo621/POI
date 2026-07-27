import {describe, expect, it} from "vitest";
import {
    addJournalEntry,
    deleteJournalEntry,
    listJournalEntries,
    parseJournal,
} from "../src/journal";

describe("journal", () => {
    it("추가, 조회, 삭제한다", () => {
        const entries = addJournalEntry([], "기록", "id-1", "2026-01-01T00:00:00.000Z");
        expect(listJournalEntries(entries)).toEqual(entries);
        expect(deleteJournalEntry(entries, "id-1")).toEqual([]);
    });

    it("저장 스키마를 검증한다", () => {
        expect(parseJournal(null)).toEqual([]);
        expect(() => parseJournal('[{"id":"x"}]')).toThrow("형식");
        expect(() => addJournalEntry([], "   ", "id", "2026-01-01T00:00:00.000Z")).toThrow();
    });
});
