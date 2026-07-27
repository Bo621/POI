export interface JournalEntry {
    id: string;
    content: string;
    createdAt: string;
}

export const JOURNAL_STORAGE_KEY = "poi.journal.v1";

export function isJournalEntry(value: unknown): value is JournalEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Record<string, unknown>;
    return typeof entry.id === "string"
        && entry.id.length > 0
        && typeof entry.content === "string"
        && entry.content.trim().length > 0
        && typeof entry.createdAt === "string"
        && !Number.isNaN(Date.parse(entry.createdAt));
}

export function parseJournal(raw: string | null): JournalEntry[] {
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every(isJournalEntry)) {
        throw new Error("저널 저장 데이터 형식이 올바르지 않습니다.");
    }
    return value;
}

export function addJournalEntry(
    entries: JournalEntry[],
    content: string,
    id: string = crypto.randomUUID(),
    createdAt = new Date().toISOString(),
): JournalEntry[] {
    const entry = {id, content: content.trim(), createdAt};
    if (!isJournalEntry(entry)) throw new Error("저널 내용을 입력해 주세요.");
    return [entry, ...entries];
}

export function listJournalEntries(entries: JournalEntry[]): JournalEntry[] {
    if (!entries.every(isJournalEntry)) throw new Error("저널 데이터 형식이 올바르지 않습니다.");
    return [...entries];
}

export function deleteJournalEntry(entries: JournalEntry[], id: string): JournalEntry[] {
    return entries.filter((entry) => entry.id !== id);
}
