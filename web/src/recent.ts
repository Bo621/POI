export interface RecentDecision {
    uid: string;
    at: number;
}

export function addRecent(list: RecentDecision[], uid: string, at: number): RecentDecision[] {
    return [{uid, at}, ...list.filter((item) => item.uid.toLowerCase() !== uid.toLowerCase())].slice(0, 5);
}

export function removeRecent(list: RecentDecision[], uid: string): RecentDecision[] {
    return list.filter((item) => item.uid.toLowerCase() !== uid.toLowerCase());
}
