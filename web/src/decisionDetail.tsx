import {OP, RESULT, deriveState, evidenceTier, formatGrade, REVEAL_STATE} from "@poi/core";
import {useEffect, useRef, useState} from "react";
import type {Address, Hex} from "viem";
import {CHAIN, EAS_ADDRESS, RESOLVERS, SCHEMAS, SCHEMA_REGISTRY_ADDRESS} from "./config";
import {buildDag, type DagResult} from "./graph";
import {
    getAttestation,
    readDecision,
    readMetricDefinition,
    readSettlement,
    readSettlementState,
    readVerificationLabel,
} from "./read";
import {AttesterLink} from "./passport";
import {Reveal} from "./reveal.tsx";
import {ZERO_UID} from "./wallet";
import {ErrorBoundary} from "./errorBoundary";
import {Settlement as SettlementForm} from "./settlement";
import {Challenge} from "./challenge";
import {rememberDecision} from "./recentStore";
import {stateLabel} from "./stateLabel";
import {useChainTime} from "./chainClock";

type Decision = Awaited<ReturnType<typeof readDecision>>;
type Settlement = Awaited<ReturnType<typeof readSettlement>>;
const MAX_SETTLEMENT_HISTORY = 8;

const resultLabel = (result: number) => result === RESULT.OBSERVED ? "OBSERVED"
    : result === RESULT.NOT_OBSERVED ? "NOT_OBSERVED" : "INDETERMINATE";
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;
const time = (value: bigint) => new Date(Number(value) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC");
/**
 * 기호는 core의 OP에서 **파생**시킨다. 배열에 손으로 늘어놓았더니 여섯 개가 전부
 * 어긋나 있었고(op=1이 `>=`인데 화면엔 `≠`), 모든 결정의 조건이 잘못 표시됐다.
 * 검증하는 사람이 읽는 값이므로 여기서 틀리면 제품 전체가 거짓말을 한다.
 */
const OP_SYMBOL: Record<number, string> = {
    [OP.GT]: ">", [OP.GTE]: "≥", [OP.LT]: "<", [OP.LTE]: "≤", [OP.EQ]: "=", [OP.NEQ]: "≠",
};
export const op = (value: number) => OP_SYMBOL[value] ?? String(value);

function CopyButton({text, children}: {text: string; children: string}) {
    const [copied, setCopied] = useState(false);
    return <button className="btn" type="button" onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
    }}>{copied ? "복사됨" : children}</button>;
}

function SettlementBlock({record, address, previous = false, onSuccess}: {record: Settlement; address?: Address; previous?: boolean; onSuccess: () => void}) {
    return <div>
        <dl className="doc-fields">
            <dt>{previous ? "이전" : "현재 (활성)"}</dt><dd className="hex">{record.uid}</dd>
            <dt>결과</dt><dd>{resultLabel(record.result)}</dd>
            <dt>관측값</dt><dd>{record.hasObservedValue ? record.observedValue.toString() : "없음"}</dd>
            <dt>출처</dt><dd>{record.source}</dd>
            <dt>관측 시각</dt><dd className="timestamp">{time(record.observedAt)}</dd>
            <dt>발행자</dt><dd><AttesterLink address={record.attester} /></dd>
        </dl>
        <ErrorBoundary label="이의"><Challenge settlementUID={record.uid} address={address} onSuccess={onSuccess} /></ErrorBoundary>
    </div>;
}

export function DecisionDetail({uid, address}: {uid: Hex; address?: Address}) {
    const [decision, setDecision] = useState<Decision>();
    const [heads, setHeads] = useState<Awaited<ReturnType<typeof readSettlementState>>>();
    const [active, setActive] = useState<Settlement>();
    const [previous, setPrevious] = useState<Settlement[]>([]);
    const {now} = useChainTime();
    const [error, setError] = useState("");
    const [settlementError, setSettlementError] = useState(false);
    const [dag, setDag] = useState<DagResult>();
    const [dagError, setDagError] = useState(false);
    const [metric, setMetric] = useState<{decimals: number; definitionHash: Hex}>();
    const [metricError, setMetricError] = useState("");
    const [issuerLabel, setIssuerLabel] = useState<string | undefined>();
    const [refreshKey, setRefreshKey] = useState(0);

    /**
     * 발행은 영수증까지 기다리는데도 바로 다시 읽으면 옛 값이 온다 —
     * 공개 RPC 는 노드가 여러 대라 쓰기 직후 읽기가 아직 반영되지 않는다.
     * 실제로 정산이 온체인에 올랐는데 화면은 「등록대기」로 남았다.
     * 그래서 한 번이 아니라 몇 번 더 읽는다.
     */
    const refreshSoon = () => {
        setRefreshKey((value) => value + 1);
        for (const delay of [2500, 6000, 12000]) {
            setTimeout(() => setRefreshKey((value) => value + 1), delay);
        }
    };
    const loadedUID = useRef<Hex>();

    useEffect(() => {
        rememberDecision(uid);
    }, [uid]);

    useEffect(() => {
        let current = true;
        setError("");
        if (loadedUID.current !== uid) {
            loadedUID.current = uid;
            setDecision(undefined); setHeads(undefined); setActive(undefined); setPrevious([]);
        }
        void (async () => {
            try {
                const attestation = await getAttestation(uid);
                if (attestation.uid === ZERO_UID) throw new Error("해당 기록을 찾을 수 없습니다.");
                if (attestation.schema.toLowerCase() !== SCHEMAS.decision.toLowerCase()) {
                    const kind = Object.entries(SCHEMAS).find(([, schema]) => schema.toLowerCase() === attestation.schema.toLowerCase())?.[0];
                    throw new Error(`결정 기록이 아닙니다.${kind ? ` (${kind})` : ""}`);
                }
                const [loadedDecision, loadedSettlement] = await Promise.all([
                    readDecision(uid), readSettlementState(SCHEMAS.settlement as Hex, uid),
                ]);
                if (!current) return;
                setDecision(loadedDecision); setHeads(loadedSettlement); setActive(loadedSettlement.active);
                setMetricError("");
                setIssuerLabel(undefined);
                void readVerificationLabel(loadedDecision.verifiedAddressUID)
                    .then((label) => { if (current) setIssuerLabel(label); })
                    .catch(() => { /* 라벨을 못 읽어도 나머지 화면은 정상이다 */ });
                void readMetricDefinition(SCHEMAS.decision as Hex, loadedDecision.outcomeMetricId)
                    .then(setMetric)
                    .catch((cause: unknown) => setMetricError(cause instanceof Error ? cause.message : "지표 정의를 불러오지 못했습니다."));
                if (attestation.revocationTime > 0n) setError("철회된 결정입니다");
                setSettlementError(false);
                setPrevious([]);
                try {
                    const history: Settlement[] = [];
                    let previousUID = loadedSettlement.active?.supersedes ?? ZERO_UID;
                    while (previousUID !== ZERO_UID && history.length < MAX_SETTLEMENT_HISTORY) {
                        const record = await readSettlement(previousUID);
                        history.push(record);
                        previousUID = record.supersedes;
                    }
                    if (current) setPrevious(history);
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
    }, [uid, refreshKey]);

    if (!decision || !heads || now === undefined) return <main><header className="doc-header"><a href="#/">← 홈</a><h1>결정 상세</h1></header><p className="form-status" role="alert">{error || "불러오는 중…"}</p></main>;
    const state = deriveState({
        hasExpectedOutcome: decision.hasExpectedOutcome, windowStart: decision.windowStart,
        windowEnd: decision.windowEnd, graceSeconds: BigInt(decision.graceSeconds),
        activeHead: heads.activeHead, activeHeadTime: heads.activeHeadTime, revokeCount: heads.revokeCount,
    }, now);
    const label = stateLabel(state.state);
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
        <ErrorBoundary label="상태"><section className="status-result">
            <div className={`seal seal--${label.tone} seal--stamping`} role="img" aria-label={`상태: ${label.seal}`}>{label.seal}</div>
            <dl className="doc-fields"><dt>상태</dt><dd>{label.seal}</dd><dt>등급</dt><dd>{grade}</dd></dl>
        </section></ErrorBoundary>
        {state.hasRevokedSettlement && <p className="revocation-note">결과 등록 철회 이력 있음</p>}
        <section className="doc-section"><h2>커밋</h2><dl className="doc-fields">
            <dt>발행자</dt><dd><AttesterLink address={decision.attester} /> · {issuerLabel ? `도장 검증 — ${issuerLabel}` : "미검증 지갑"}</dd>
            <dt>커밋 시각</dt><dd className="timestamp">{time(decision.time)}</dd>
            <dt>검증 스냅샷</dt><dd className="hex">{decision.verifiedAddressUID}</dd>
        </dl></section>
        <section className="doc-section"><h2>예상 결과</h2><dl className="doc-fields">
            <dt>지표</dt><dd className="hex">{decision.outcomeMetricId}</dd>
            <dt>조건</dt><dd>{op(decision.outcomeOp)} {decision.outcomeThreshold.toString()}</dd>
            <dt>관측 구간</dt><dd>{time(decision.windowStart)} ~ {time(decision.windowEnd)}</dd>
            <dt>유예</dt><dd>{decision.graceSeconds}초</dd>
        </dl></section>
        <ErrorBoundary label="결과 등록"><section className="doc-section"><h2>결과 등록</h2>
            <p className="doc-note">선언한 예상 결과가 실제로 어떻게 됐는지 온체인에 남깁니다.<br />
                넣는 것은 관측값과 출처뿐이고, 맞았는지 여부는 컨트랙트가 계산합니다.</p>
            {owner && <SettlementForm decisionUID={uid} address={address} onSuccess={refreshSoon} />}
            {address && !owner && <p className="doc-note">결정 작성자만 결과를 등록할 수 있습니다.</p>}
            {!address && <><button className="btn-commit" type="button" disabled>결과 등록하기</button><p className="doc-note">지갑을 연결해야 결과를 등록할 수 있습니다.</p></>}
            {settlementError && <p className="form-status">확인 불가 <button className="btn" onClick={() => window.location.reload()}>다시 시도</button></p>}
            {active ? <SettlementBlock record={active} address={address} onSuccess={refreshSoon} /> : <p className="doc-note">활성 결과 등록이 없습니다.</p>}
            {previous.length > 0 && <details><summary>이전 결과 등록 (철회됨)</summary>
                {previous.map((record) => <SettlementBlock key={record.uid} record={record} address={address} previous onSuccess={refreshSoon} />)}
            </details>}
            <p className="notice--quiet">결과는 관측값으로부터 컨트랙트가 판정합니다. 직접 고를 수 없습니다.</p>
        </section></ErrorBoundary>
        <ErrorBoundary label="공개"><Reveal attestationUID={uid} /></ErrorBoundary>
        <ErrorBoundary label="계보"><section className="doc-section"><h2>계보</h2><details><summary>계보</summary>
            <p className="notice--quiet">조회된 것이 전부라는 보장은 없습니다.</p>
            {dagError && <p className="form-status">확인 불가</p>}
            {dag?.nodes.map(node => <dl className="doc-fields" key={node.uid}><dt>UID</dt><dd className="hex">{node.uid}</dd><dt>발행자</dt><dd><AttesterLink address={node.attester} /></dd></dl>)}
        </details></section></ErrorBoundary>
        <ErrorBoundary label="검증 근거"><section className="doc-section"><details><summary>검증 근거</summary><dl className="doc-fields">
            <dt>체인</dt><dd>{CHAIN.name} · chainId {CHAIN.id}</dd>
            <dt>EAS</dt><dd className="hex">{EAS_ADDRESS}</dd><dt>SchemaRegistry</dt><dd className="hex">{SCHEMA_REGISTRY_ADDRESS}</dd>
            <dt>결정 스키마</dt><dd className="hex">{SCHEMAS.decision}</dd><dt>resolver</dt><dd className="hex">{RESOLVERS.decision}</dd>
            <dt>결과 등록 스키마</dt><dd className="hex">{SCHEMAS.settlement}</dd><dt>resolver</dt><dd className="hex">{RESOLVERS.settlement}</dd>
            <dt>지표</dt><dd className="hex">{decision.outcomeMetricId}</dd><dt>definitionHash</dt><dd className="hex">{metric?.definitionHash ?? "확인 불가"}</dd>
            {metricError && <><dt>지표 오류</dt><dd className="form-status" role="alert">! {metricError}</dd></>}
            <dt>문서</dt><dd>docs/metrics/{decision.outcomeMetricId}.md</dd>
        </dl><p className="doc-note">온체인 definitionHash가 이 문서의 해시와 다르면 verifier가 불일치로 판정합니다.</p></details></section></ErrorBoundary>
        <section className="doc-section"><h2>오프체인 검증</h2><pre>$ poi-verify {uid} --rpc &lt;url&gt; --json</pre><CopyButton text={`poi-verify ${uid} --rpc <url> --json`}>복사</CopyButton></section>
    </main>;
}
