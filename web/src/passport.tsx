import {useEffect, useState} from "react";
import type {Address, Hex} from "viem";
import {loadRecords, type RecordRow} from "./records";
import {describeState} from "./status";

export type PassportRow = RecordRow;

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
        grade: row.grade,
    };
}

function short(value: Hex): string {
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function Passport({address}: {address: Address}) {
    const [rows, setRows] = useState<PassportRow[]>();
    const [error, setError] = useState("");

    async function load() {
        setError("");
        try {
            setRows(await loadRecords(address));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했습니다.");
        }
    }
    useEffect(() => {
        void load();
    }, [address]);

    return (
        <section className="doc-section">
            <h2>Strategy Passport</h2>
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
                        {row.hasRevoked && <><dt>이력</dt><dd className="revocation-note">정산 철회 이력 있음</dd></>}
                    </dl>
                );
            })}
            {error && <p className="form-status" role="alert">{error}</p>}
        </section>
    );
}
