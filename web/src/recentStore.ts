import type {Hex} from "viem";
import {addRecent, type RecentDecision} from "./recent";

export const RECENT_KEY = "poi.recent-decisions";
const UID_PATTERN = /^0x[0-9a-f]{64}$/i;

export function readRecent(): RecentDecision[] {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((item): item is RecentDecision =>
            typeof item === "object" && item !== null
            && typeof (item as RecentDecision).uid === "string"
            && UID_PATTERN.test((item as RecentDecision).uid)
            && typeof (item as RecentDecision).at === "number",
        ).slice(0, 5);
    } catch {
        return [];
    }
}

export function rememberDecision(uid: Hex): void {
    localStorage.setItem(RECENT_KEY, JSON.stringify(addRecent(readRecent(), uid, Date.now())));
}
