import {
    deriveState,
    evidenceTier,
    formatGrade,
    REVEAL_STATE,
    type PoiState,
} from "@poi/core";
import {useState, type FormEvent} from "react";
import type {Address, Hex} from "viem";
import {SCHEMAS, isDeployed} from "./config";
import {describeState} from "./status";
import {
    getChainTime,
    readDecisionLogs,
    readSettlement,
    readSettlementHeads,
} from "./read";
import {ZERO_UID} from "./wallet";

export interface PassportRow {
    uid: Hex;
    committedAt: bigint;
    state: PoiState;
    evidenceCommitment: Hex;
    hasExpectedOutcome: boolean;
}

export function sortByCommittedAtDesc(rows: PassportRow[]): PassportRow[] {
    return rows
        .map((row, index) => ({row, index}))
        .sort((a, b) => a.row.committedAt === b.row.committedAt
            ? a.index - b.index
            : a.row.committedAt > b.row.committedAt ? -1 : 1)
        .map(({row}) => row);
}

export function summarizeRow(row: PassportRow): {label: string; grade: string} {
    return {
        label: describeState(row.state),
        grade: formatGrade(evidenceTier(row.evidenceCommitment), REVEAL_STATE.SEALED),
    };
}

function short(value: Hex): string {
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function Passport() {
    const [address, setAddress] = useState("");
    const [rows, setRows] = useState<PassportRow[]>();
    const [error, setError] = useState("");

    async function load(event: FormEvent) {
        event.preventDefault();
        setError("");
        try {
            if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("지갑 주소를 확인해 주세요.");
            const [decisions, now] = await Promise.all([
                readDecisionLogs(SCHEMAS.decision as Hex, address as Address),
                getChainTime(),
            ]);
            const loaded = await Promise.all(decisions.map(async (decision): Promise<PassportRow> => {
                const heads = await readSettlementHeads(SCHEMAS.settlement as Hex, decision.uid);
                const active = heads.activeHead === ZERO_UID ? undefined : await readSettlement(heads.activeHead);
                return {
                    uid: decision.uid,
                    committedAt: decision.time,
                    state: deriveState({
                        hasExpectedOutcome: decision.hasExpectedOutcome,
                        windowStart: decision.windowStart,
                        windowEnd: decision.windowEnd,
                        graceSeconds: BigInt(decision.graceSeconds),
                        activeHead: heads.activeHead,
                        activeHeadTime: active?.time,
                        revokeCount: heads.revokeCount,
                    }, now).state,
                    evidenceCommitment: decision.evidenceCommitment,
                    hasExpectedOutcome: decision.hasExpectedOutcome,
                };
            }));
            setRows(sortByCommittedAtDesc(loaded));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했습니다.");
        }
    }

    return (
        <section className="doc-section">
            <h2>Strategy Passport</h2>
            <form className="doc-form" onSubmit={load}>
                <div className="field">
                    <label htmlFor="passport-address">지갑 주소</label>
                    <input className="hex" id="passport-address" value={address} onChange={(event) => setAddress(event.target.value)} />
                </div>
                <button className="btn" type="submit" disabled={!isDeployed()}>기록 조회</button>
            </form>
            <p className="notice--quiet">이 목록은 조회된 기록의 나열입니다. 순위나 성과 지표가 아닙니다.</p>
            <p className="notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
            {rows?.map((row) => {
                const summary = summarizeRow(row);
                return (
                    <dl className="doc-fields" key={row.uid}>
                        <dt>UID</dt><dd className="hex">{short(row.uid)}</dd>
                        <dt>커밋 시각</dt><dd className="hex">{new Date(Number(row.committedAt) * 1000).toLocaleString("ko-KR")}</dd>
                        <dt>상태</dt><dd>{summary.label}</dd>
                        <dt>등급</dt><dd>{summary.grade}</dd>
                        <dt>예상 결과</dt><dd>{row.hasExpectedOutcome ? "선언함" : "선언하지 않음"}</dd>
                    </dl>
                );
            })}
            {error && <p className="form-status" role="alert">{error}</p>}
        </section>
    );
}
