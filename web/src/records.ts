import {
    deriveState,
    evidenceTier,
    formatGrade,
    REVEAL_STATE,
    STATE,
    type PoiState,
} from "@poi/core";
import type {Address, Hex} from "viem";
import {SCHEMAS} from "./config";
import {getChainTime, readDecisionLogs, readSettlementState} from "./read";

export interface RecordRow {
    uid: Hex;
    committedAt: bigint;
    state: PoiState;
    hasRevoked: boolean;
    grade: string;
}

export async function loadRecords(address: Address): Promise<RecordRow[]> {
    const [decisions, now] = await Promise.all([
        readDecisionLogs(SCHEMAS.decision as Hex, address),
        getChainTime(),
    ]);
    const rows = await Promise.all(decisions.map(async (decision): Promise<RecordRow> => {
        const heads = await readSettlementState(SCHEMAS.settlement as Hex, decision.uid);
        return {
            uid: decision.uid,
            committedAt: decision.time,
            state: deriveState({
                hasExpectedOutcome: decision.hasExpectedOutcome,
                windowStart: decision.windowStart,
                windowEnd: decision.windowEnd,
                graceSeconds: BigInt(decision.graceSeconds),
                activeHead: heads.activeHead,
                activeHeadTime: heads.activeHeadTime,
                revokeCount: heads.revokeCount,
            }, now).state,
            hasRevoked: heads.revokeCount > 0,
            grade: formatGrade(evidenceTier(decision.evidenceCommitment), REVEAL_STATE.SEALED),
        };
    }));
    return rows
        .map((row, index) => ({row, index}))
        .sort((a, b) => a.row.committedAt === b.row.committedAt
            ? a.index - b.index
            : a.row.committedAt > b.row.committedAt ? -1 : 1)
        .map(({row}) => row);
}

export function needsAction(rows: RecordRow[]): RecordRow[] {
    return rows.filter(({state}) => state === STATE.AWAITING || state === STATE.OVERDUE);
}
