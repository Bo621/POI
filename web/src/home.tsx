import {METRICS, deriveState, type PoiState} from "@poi/core";
import {useEffect, useState, type FormEvent} from "react";
import type {Address, Hex} from "viem";
import seed from "../../docs/fixtures/seed.json";
import {publicClient} from "./chain";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {navigate} from "./router";
import {getChainTime, readDecision, readSettlementState} from "./read";
import {readRecent} from "./recentStore";
import {describeState} from "./status";
import {loadRecords, needsAction, type RecordRow} from "./records";

const UID_PATTERN = /^0x[0-9a-f]{64}$/i;
const envExamples = (import.meta.env.VITE_EXAMPLE_UIDS ?? "")
    .split(",").map((uid: string) => uid.trim()).filter((uid: string) => UID_PATTERN.test(uid));
const seedExamples = [seed.fixtures.f1, seed.fixtures.f2, seed.fixtures.f4, seed.fixtures.f5]
    .map((fixture) => fixture.decisionUID)
    .filter((uid): uid is Hex => UID_PATTERN.test(uid));
const exampleUIDs = (envExamples.length > 0 ? envExamples : seedExamples) as Hex[];

interface DecisionSummary {
    uid: Hex;
    state: PoiState;
}

async function loadSummaries(uids: Hex[]): Promise<DecisionSummary[]> {
    const now = await getChainTime();
    return Promise.all(uids.map(async (uid) => {
        const [decision, heads] = await Promise.all([
            readDecision(uid),
            readSettlementState(SCHEMAS.settlement as Hex, uid),
        ]);
        return {
            uid,
            state: deriveState({
                hasExpectedOutcome: decision.hasExpectedOutcome,
                windowStart: decision.windowStart,
                windowEnd: decision.windowEnd,
                graceSeconds: BigInt(decision.graceSeconds),
                activeHead: heads.activeHead,
                activeHeadTime: heads.activeHeadTime,
                revokeCount: heads.revokeCount,
            }, now).state,
        };
    }));
}

function short(uid: string): string {
    return `${uid.slice(0, 10)}…${uid.slice(-6)}`;
}

function SummaryList({rows}: {rows: DecisionSummary[]}) {
    return <ul className="record-list">{rows.map((row) => <li key={row.uid}>
        <dl className="doc-fields">
            <dt>상태</dt><dd className={row.state === "OVERDUE" ? "revocation-note" : ""}>{describeState(row.state)}</dd>
            <dt>UID</dt><dd className="hex">{short(row.uid)}</dd>
        </dl>
        <a className="btn" href={`#/d/${row.uid}`}>보기 →</a>
    </li>)}</ul>;
}

function WalletRows({rows}: {rows: RecordRow[]}) {
    return <ul className="record-list">{rows.map((row) => <li key={row.uid}>
        <dl className="doc-fields">
            <dt>상태</dt><dd className={row.state === "OVERDUE" ? "revocation-note" : ""}>{describeState(row.state)}</dd>
            <dt>UID</dt><dd className="hex">{short(row.uid)}</dd>
            <dt>커밋 시각</dt><dd className="hex">{new Date(Number(row.committedAt) * 1000).toLocaleString("ko-KR")}</dd>
        </dl>
        <a className="btn" href={`#/d/${row.uid}`}>{row.state === "AWAITING" ? "정산하기 →" : "보기 →"}</a>
    </li>)}</ul>;
}

export function Home({address}: {address?: Address}) {
    const [uid, setUid] = useState("");
    const [examples, setExamples] = useState<DecisionSummary[]>([]);
    const [recent] = useState(readRecent);
    const [recentRows, setRecentRows] = useState<DecisionSummary[]>([]);
    const [records, setRecords] = useState<RecordRow[]>();
    const [latestBlockAt, setLatestBlockAt] = useState<bigint>();

    useEffect(() => {
        if (exampleUIDs.length > 0) void loadSummaries(exampleUIDs).then(setExamples).catch(() => setExamples([]));
        const recentUIDs = recent.map((item) => item.uid as Hex);
        if (recentUIDs.length > 0) void loadSummaries(recentUIDs).then(setRecentRows).catch(() => setRecentRows([]));
        void publicClient.getBlock().then((block) => setLatestBlockAt(block.timestamp)).catch(() => undefined);
    }, [recent]);

    useEffect(() => {
        if (!address) {
            setRecords(undefined);
            return;
        }
        void loadRecords(address).then(setRecords).catch(() => setRecords([]));
    }, [address]);

    function open(event: FormEvent) {
        event.preventDefault();
        if (UID_PATTERN.test(uid.trim())) navigate({name: "decision", uid: uid.trim().toLowerCase() as Hex});
    }

    return <main>
        <header className="doc-header">
            <h1>POI 판단 증서</h1>
            <p className="doc-meta">{CHAIN.name} · chainId {CHAIN.id}</p>
        </header>
        <p>투자 판단을 내린 시점과 내용을 온체인에 고정합니다.<br />
            결과가 나온 뒤 그 판단이 맞았는지 누구나 검증할 수 있습니다.<br />
            판단의 결과는 발행자가 아니라 컨트랙트가 산술로 판정합니다.</p>

        <section className="doc-section">
            <h2>기록 열기</h2>
            <p className="doc-note">지갑이 필요 없습니다.</p>
            <form className="doc-form" onSubmit={open}>
                <label htmlFor="home-decision-uid">decisionUID</label>
                <input id="home-decision-uid" className="hex" value={uid} onChange={(event) => setUid(event.target.value)} placeholder="0x…" />
                <button className="btn" type="submit" disabled={!UID_PATTERN.test(uid.trim())}>열기</button>
            </form>
        </section>

        {examples.length > 0 && <section className="doc-section"><h2>예시 증서</h2><SummaryList rows={examples} /></section>}
        {recentRows.length > 0 && <section className="doc-section"><h2>최근 열어본 증서</h2>
            <ul className="record-list">{recentRows.map((row) => {
                const visit = recent.find((item) => item.uid.toLowerCase() === row.uid.toLowerCase());
                return <li key={row.uid}><dl className="doc-fields">
                    <dt>상태</dt><dd className={row.state === "OVERDUE" ? "revocation-note" : ""}>{describeState(row.state)}</dd>
                    <dt>UID</dt><dd className="hex">{short(row.uid)}</dd>
                    <dt>마지막 조회</dt><dd>{visit ? new Date(visit.at).toLocaleString("ko-KR") : ""}</dd>
                </dl><a className="btn" href={`#/d/${row.uid}`}>보기 →</a></li>;
            })}</ul>
        </section>}

        <section className="doc-section"><details><summary>검증 환경</summary><dl className="doc-fields">
            <dt>체인</dt><dd>{CHAIN.name} · chainId {CHAIN.id}</dd>
            <dt>최신 블록 시각</dt><dd className="hex">{latestBlockAt === undefined ? "확인 불가" : new Date(Number(latestBlockAt) * 1000).toLocaleString("ko-KR")}</dd>
            <dt>컨트랙트</dt><dd>{isDeployed() ? "배포됨" : "설정 필요"}</dd>
            <dt>스키마</dt><dd>{Object.keys(SCHEMAS).join(" · ")}</dd>
            <dt>지표 정의</dt><dd>{METRICS.map((metric) => `${metric.name} · definitionHash ${metric.definitionHash}`).join(" / ")}</dd>
        </dl></details></section>

        {address && <><section className="doc-section"><h2>처리할 기록</h2><p className="hex">{address}</p>
            {records && (needsAction(records).length > 0 ? <WalletRows rows={needsAction(records)} /> : <p className="doc-note">지금 처리할 기록이 없습니다.</p>)}
        </section>
        <section className="doc-section"><h2>최근 커밋한 기록</h2>
            {records && (records.length > 0 ? <WalletRows rows={records.slice(0, 5)} /> : <p className="doc-note">표시할 기록이 없습니다.</p>)}
            <p><a className="btn" href="#/me">내 기록 전체 →</a></p>
        </section></>}
    </main>;
}
