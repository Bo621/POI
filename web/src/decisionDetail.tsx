import {RESULT, STATE, deriveState, evidenceTier, formatGrade, REVEAL_STATE, type PoiState} from "@poi/core";
import {useEffect, useState} from "react";
import type {Address, Hex} from "viem";
import {CHAIN, EAS_ADDRESS, RESOLVERS, SCHEMAS, SCHEMA_REGISTRY_ADDRESS} from "./config";
import {buildDag, type DagResult} from "./graph";
import {
    getAttestation,
    getChainTime,
    readChallengeLogs,
    readDecision,
    readMetricDefinition,
    readSettlement,
    readSettlementHeads,
    readVerified,
    type ChallengeLog,
} from "./read";
import {Reveal} from "./reveal.tsx";
import {describeState} from "./status";
import {ZERO_UID} from "./wallet";

type Decision = Awaited<ReturnType<typeof readDecision>>;
type Settlement = Awaited<ReturnType<typeof readSettlement>>;

const stateSeal: Record<PoiState, {text: string; tone: string; label: string}> = {
    [STATE.NOT_REQUIRED]: {text: "해당없음", tone: "faint", label: "해당 없음"},
    [STATE.PENDING]: {text: "대기", tone: "ink", label: "대기"},
    [STATE.OBSERVING]: {text: "관측중", tone: "ink", label: "관측 중"},
    [STATE.AWAITING]: {text: "정산대기", tone: "ink", label: "정산 대기"},
    [STATE.OVERDUE]: {text: "기한초과", tone: "seal", label: "기한 초과"},
    [STATE.SETTLED]: {text: "정산완료", tone: "indigo", label: "정산 완료"},
    [STATE.SETTLED_LATE]: {text: "지연정산", tone: "indigo", label: "지연 정산"},
};
const resultLabel = (result: number) => result === RESULT.OBSERVED ? "OBSERVED"
    : result === RESULT.NOT_OBSERVED ? "NOT_OBSERVED" : "INDETERMINATE";
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;
const time = (value: bigint) => new Date(Number(value) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
const op = (value: number) => ["=", "≠", ">", "≥", "<", "≤"][value] ?? String(value);

function CopyButton({text, children}: {text: string; children: string}) {
    const [copied, setCopied] = useState(false);
    return <button className="btn" type="button" onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
    }}>{copied ? "복사됨" : children}</button>;
}

function Challenges({settlementUID, address}: {settlementUID: Hex; address?: Address}) {
    const [items, setItems] = useState<(ChallengeLog & {verified: boolean | "unknown"})[]>();
    const [failed, setFailed] = useState(false);
    async function load() {
        setFailed(false);
        try {
            const logs = (await readChallengeLogs(SCHEMAS.challenge as Hex))
                .filter((item) => item.refUID.toLowerCase() === settlementUID.toLowerCase() && item.revocationTime === 0n);
            setItems(await Promise.all(logs.map(async item => ({...item, verified: await readVerified(item.attester)}))));
        } catch {
            setFailed(true);
        }
    }
    useEffect(() => { void load(); }, [settlementUID]);
    return <div>
        <h3>이의</h3>
        <p className="notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
        {failed && <p className="form-status" role="alert">이의 목록을 불러오지 못했습니다. <button className="btn" onClick={load}>다시 시도</button></p>}
        <ul className="record-list">{items?.map(item => <li key={item.uid}>
            <span className="hex">{item.uid}</span> · <span className="hex">{item.attester}</span> ·
            {item.verified === true ? " 검증 지갑" : item.verified === false ? " 미검증 지갑" : " 확인 불가"} ·
            {" "}{resultLabel(item.claimedResult ?? RESULT.INDETERMINATE)} · 출처 {item.source ?? ""}
        </li>)}</ul>
        <button className="btn-commit" type="button" disabled={!address}>이의 제기</button>
        {!address && <p className="doc-note">지갑을 연결해야 이의를 제기할 수 있습니다.</p>}
    </div>;
}

function SettlementBlock({record, address, previous = false}: {record: Settlement; address?: Address; previous?: boolean}) {
    return <div>
        <dl className="doc-fields">
            <dt>{previous ? "이전" : "현재 (활성)"}</dt><dd className="hex">{record.uid}</dd>
            <dt>결과</dt><dd>{resultLabel(record.result)}</dd>
            <dt>관측값</dt><dd>{record.hasObservedValue ? record.observedValue.toString() : "없음"}</dd>
            <dt>출처</dt><dd>{record.source}</dd>
            <dt>관측 시각</dt><dd className="timestamp">{time(record.observedAt)}</dd>
            <dt>발행자</dt><dd className="hex">{record.attester}</dd>
        </dl>
        <Challenges settlementUID={record.uid} address={address} />
    </div>;
}

export function DecisionDetail({uid, address}: {uid: Hex; address?: Address}) {
    const [decision, setDecision] = useState<Decision>();
    const [heads, setHeads] = useState<Awaited<ReturnType<typeof readSettlementHeads>>>();
    const [active, setActive] = useState<Settlement>();
    const [previous, setPrevious] = useState<Settlement>();
    const [now, setNow] = useState<bigint>();
    const [error, setError] = useState("");
    const [settlementError, setSettlementError] = useState(false);
    const [dag, setDag] = useState<DagResult>();
    const [dagError, setDagError] = useState(false);
    const [metric, setMetric] = useState<{decimals: number; definitionHash: Hex}>();

    useEffect(() => {
        let current = true;
        setError(""); setDecision(undefined); setHeads(undefined); setActive(undefined);
        void (async () => {
            try {
                const attestation = await getAttestation(uid);
                if (attestation.uid === ZERO_UID) throw new Error("해당 기록을 찾을 수 없습니다.");
                if (attestation.schema.toLowerCase() !== SCHEMAS.decision.toLowerCase()) {
                    const kind = Object.entries(SCHEMAS).find(([, schema]) => schema.toLowerCase() === attestation.schema.toLowerCase())?.[0];
                    throw new Error(`결정 기록이 아닙니다.${kind ? ` (${kind})` : ""}`);
                }
                const [loadedDecision, loadedHeads, chainNow] = await Promise.all([
                    readDecision(uid), readSettlementHeads(SCHEMAS.settlement as Hex, uid), getChainTime(),
                ]);
                if (!current) return;
                setDecision(loadedDecision); setHeads(loadedHeads); setNow(chainNow);
                void readMetricDefinition(SCHEMAS.decision as Hex, loadedDecision.outcomeMetricId).then(setMetric).catch(() => {});
                if (attestation.revocationTime > 0n) setError("철회된 결정입니다");
                setSettlementError(false);
                try {
                    if (loadedHeads.activeHead !== ZERO_UID) setActive(await readSettlement(loadedHeads.activeHead));
                    if (loadedHeads.lastHead !== ZERO_UID && loadedHeads.lastHead !== loadedHeads.activeHead) setPrevious(await readSettlement(loadedHeads.lastHead));
                } catch { setSettlementError(true); }
                setDagError(false);
                try {
                    setDag(await buildDag(uid, async item => {
                        const row = await readDecision(item);
                        return {attester: row.attester, time: row.time, parents: row.parents};
                    }));
                } catch { setDagError(true); }
            } catch (cause) {
                if (current) setError(cause instanceof Error ? cause.message : "확인 불가");
            }
        })();
        return () => { current = false; };
    }, [uid]);

    if (!decision || !heads || now === undefined) return <main><header className="doc-header"><a href="#/">← 홈</a><h1>결정 상세</h1></header><p className="form-status" role="alert">{error || "불러오는 중…"}</p></main>;
    const state = deriveState({
        hasExpectedOutcome: decision.hasExpectedOutcome, windowStart: decision.windowStart,
        windowEnd: decision.windowEnd, graceSeconds: BigInt(decision.graceSeconds),
        activeHead: heads.activeHead, activeHeadTime: active?.time, revokeCount: heads.revokeCount,
    }, now);
    const seal = stateSeal[state.state];
    const grade = formatGrade(evidenceTier(decision.evidenceCommitment), REVEAL_STATE.SEALED);
    const owner = address?.toLowerCase() === decision.attester.toLowerCase();
    return <main>
        <header className="doc-header">
            <a href="#/">← 홈</a>
            <h1>결정 상세</h1>
            <p className="hex">{uid}</p>
            <div className="button-row"><CopyButton text={uid}>UID 복사</CopyButton><CopyButton text={window.location.href}>이 화면 링크 복사</CopyButton></div>
        </header>
        {error && <p className="notice" role="alert">! {error}</p>}
        <section className="status-result">
            <div className={`seal seal--${seal.tone} seal--stamping`} role="img" aria-label={`상태: ${seal.label}`}>{seal.text}</div>
            <dl className="doc-fields"><dt>상태</dt><dd>{describeState(state.state)}</dd><dt>등급</dt><dd>{grade}</dd></dl>
        </section>
        {state.hasRevokedSettlement && <p className="revocation-note">정산 철회 이력 있음</p>}
        <section className="doc-section"><h2>커밋</h2><dl className="doc-fields">
            <dt>발행자</dt><dd className="hex">{decision.attester} · 미검증 지갑</dd>
            <dt>커밋 시각</dt><dd className="timestamp">{time(decision.time)}</dd>
            <dt>검증 스냅샷</dt><dd className="hex">{decision.verifiedAddressUID}</dd>
        </dl></section>
        <section className="doc-section"><h2>예상 결과</h2><dl className="doc-fields">
            <dt>지표</dt><dd className="hex">{decision.outcomeMetricId}</dd>
            <dt>조건</dt><dd>{op(decision.outcomeOp)} {decision.outcomeThreshold.toString()}</dd>
            <dt>관측 구간</dt><dd>{time(decision.windowStart)} ~ {time(decision.windowEnd)}</dd>
            <dt>유예</dt><dd>{decision.graceSeconds}초</dd>
        </dl></section>
        <section className="doc-section"><h2>정산</h2>
            {owner && <button className="btn-commit" type="button">정산하기</button>}
            {!address && <><button className="btn-commit" type="button" disabled>정산하기</button><p className="doc-note">지갑을 연결해야 정산할 수 있습니다.</p></>}
            {settlementError && <p className="form-status">확인 불가 <button className="btn" onClick={() => window.location.reload()}>다시 시도</button></p>}
            {active ? <SettlementBlock record={active} address={address} /> : <p className="doc-note">활성 정산이 없습니다.</p>}
            {previous && <details><summary>이전 정산 (철회됨)</summary><SettlementBlock record={previous} address={address} previous /></details>}
            <p className="notice--quiet">결과는 관측값으로부터 컨트랙트가 판정합니다. 직접 고를 수 없습니다.</p>
        </section>
        <Reveal attestationUID={uid} />
        <section className="doc-section"><h2>계보</h2><details><summary>계보</summary>
            <p className="notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
            {dagError && <p className="form-status">확인 불가</p>}
            {dag?.nodes.map(node => <dl className="doc-fields" key={node.uid}><dt>UID</dt><dd className="hex">{node.uid}</dd><dt>발행자</dt><dd className="hex">{node.attester}</dd></dl>)}
        </details></section>
        <section className="doc-section"><details><summary>검증 근거</summary><dl className="doc-fields">
            <dt>체인</dt><dd>{CHAIN.name} · chainId {CHAIN.id}</dd>
            <dt>EAS</dt><dd className="hex">{EAS_ADDRESS}</dd><dt>SchemaRegistry</dt><dd className="hex">{SCHEMA_REGISTRY_ADDRESS}</dd>
            <dt>결정 스키마</dt><dd className="hex">{SCHEMAS.decision}</dd><dt>resolver</dt><dd className="hex">{RESOLVERS.decision}</dd>
            <dt>정산 스키마</dt><dd className="hex">{SCHEMAS.settlement}</dd><dt>resolver</dt><dd className="hex">{RESOLVERS.settlement}</dd>
            <dt>지표</dt><dd className="hex">{decision.outcomeMetricId}</dd><dt>definitionHash</dt><dd className="hex">{metric?.definitionHash ?? "확인 불가"}</dd>
            <dt>문서</dt><dd>docs/metrics/{decision.outcomeMetricId}.md</dd>
        </dl><p className="doc-note">온체인 definitionHash가 이 문서의 해시와 다르면 verifier가 불일치로 판정합니다.</p></details></section>
        <section className="doc-section"><h2>오프체인 검증</h2><pre>$ poi-verify {uid} --rpc &lt;url&gt; --json</pre><CopyButton text={`poi-verify ${uid} --rpc <url> --json`}>복사</CopyButton></section>
    </main>;
}
