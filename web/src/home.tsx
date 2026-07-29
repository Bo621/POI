import {METRICS, deriveState, type PoiState} from "@poi/core";
import {useEffect, useState, type FormEvent, type ReactNode} from "react";
import type {Address, Hex} from "viem";
import {publicClient} from "./chain";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {navigate} from "./router";
import {AttestationNotFoundError, getChainTime, readDecision, readSettlementState} from "./read";
import {forgetDecision, readRecent} from "./recentStore";
import {loadRecords, needsAction, type RecordRow} from "./records";
import {RecordRowView} from "./recordRow";

const UID_PATTERN = /^0x[0-9a-f]{64}$/i;
const envExamples = (import.meta.env.VITE_EXAMPLE_UIDS ?? "")
    .split(",").map((uid: string) => uid.trim()).filter((uid: string) => UID_PATTERN.test(uid));

interface DecisionSummary {
    uid: Hex;
    state: PoiState;
    hasRevoked: boolean;
}

interface FailedSummary {
    uid: Hex;
    error: string;
    kind: "missing" | "lookup-error";
}

type SummaryResult = DecisionSummary | FailedSummary;
type LoadState<T> =
    | {status: "loading"}
    | {status: "success"; data: T}
    | {status: "failed"; error: string};

function errorMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

async function loadExampleUIDs(): Promise<Hex[]> {
    if (envExamples.length > 0) return envExamples as Hex[];
    const response = await fetch(`${import.meta.env.BASE_URL}seed.json?t=${Date.now()}`, {cache: "no-store"});
    if (!response.ok) throw new Error(`seed.json 요청 실패 (${response.status})`);
    const seed: unknown = await response.json();
    const fixtures = (seed as {fixtures?: Record<string, {decisionUID?: unknown}>}).fixtures;
    if (!fixtures) throw new Error("seed.json에 fixtures가 없습니다.");
    return ["f1", "f2", "f4", "f5"]
        .map((key) => fixtures[key]?.decisionUID)
        .filter((uid): uid is Hex => typeof uid === "string" && UID_PATTERN.test(uid));
}

async function loadSummaries(uids: Hex[]): Promise<SummaryResult[]> {
    const now = await getChainTime();
    const results = await Promise.allSettled(uids.map(async (uid): Promise<DecisionSummary> => {
        const decision = await readDecision(uid);
        const heads = await readSettlementState(SCHEMAS.settlement as Hex, uid);
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
            hasRevoked: heads.revokeCount > 0n,
        };
    }));
    return results.map((result, index) => result.status === "fulfilled"
        ? result.value
        : {
            uid: uids[index],
            error: errorMessage(result.reason),
            kind: result.reason instanceof AttestationNotFoundError ? "missing" : "lookup-error",
        });
}

function isFailedSummary(row: SummaryResult): row is FailedSummary {
    return "error" in row;
}

function SummaryList({rows}: {rows: SummaryResult[]}) {
    return <ul className="record-list">{rows.map((row) =>
        isFailedSummary(row)
            ? <li className="record-row" key={row.uid}>
                <span className="notice" role="alert">! 불러오지 못함</span>
                <span className="hex record-row__uid">{row.uid}</span>
                <span className="record-row__detail">{row.error}</span>
            </li>
            : <RecordRowView
                key={row.uid}
                uid={row.uid}
                state={row.state}
                warning={row.hasRevoked ? "결과 등록 철회 이력 있음" : undefined}
            />
    )}</ul>;
}

function LoadStateView<T>({state, emptyText = "표시할 기록이 없습니다.", failureText, retry, children}: {
    state: LoadState<T[]>;
    emptyText?: string;
    failureText: string;
    retry: () => void;
    children: (rows: T[]) => ReactNode;
}) {
    if (state.status === "loading") return <p className="doc-note">불러오는 중…</p>;
    if (state.status === "failed") return <p className="form-status" role="alert">
        ! {failureText} {state.error} <button className="btn" type="button" onClick={retry}>다시 시도</button>
    </p>;
    return state.data.length > 0 ? children(state.data) : <p className="doc-note">{emptyText}</p>;
}

function WalletRows({rows}: {rows: RecordRow[]}) {
    return <ul className="record-list">{rows.map((row) =>
        <RecordRowView
            key={row.uid}
            uid={row.uid}
            state={row.state}
            action={row.state === "AWAITING" ? "결과 등록하기 →" : "보기 →"}
            detail={new Date(Number(row.committedAt) * 1000).toLocaleString("ko-KR")}
            warning={row.hasRevoked ? "결과 등록 철회 이력 있음" : undefined}
        />
    )}</ul>;
}

export function Home({address}: {address?: Address}) {
    const [uid, setUid] = useState("");
    const [examples, setExamples] = useState<LoadState<SummaryResult[]>>({status: "loading"});
    const [recent, setRecent] = useState(readRecent);
    const [recentRows, setRecentRows] = useState<LoadState<SummaryResult[]>>({status: "loading"});
    const [records, setRecords] = useState<LoadState<RecordRow[]>>({status: "loading"});
    const [latestBlockAt, setLatestBlockAt] = useState<bigint>();
    const [latestBlockError, setLatestBlockError] = useState("");
    const [examplesRetry, setExamplesRetry] = useState(0);
    const [recentRetry, setRecentRetry] = useState(0);
    const [recordsRetry, setRecordsRetry] = useState(0);
    const [blockRetry, setBlockRetry] = useState(0);

    useEffect(() => {
        let active = true;
        setExamples({status: "loading"});
        void loadExampleUIDs()
            .then(loadSummaries)
            .then((data) => { if (active) setExamples({status: "success", data}); })
            .catch((cause: unknown) => { if (active) setExamples({status: "failed", error: errorMessage(cause)}); });
        return () => { active = false; };
    }, [examplesRetry]);

    useEffect(() => {
        let active = true;
        setRecentRows({status: "loading"});
        const recentUIDs = recent.map((item) => item.uid as Hex);
        if (recentUIDs.length === 0) setRecentRows({status: "success", data: []});
        else void loadSummaries(recentUIDs)
            .then((data) => { if (active) setRecentRows({status: "success", data}); })
            .catch((cause: unknown) => { if (active) setRecentRows({status: "failed", error: errorMessage(cause)}); });
        return () => { active = false; };
    }, [recent, recentRetry]);

    useEffect(() => {
        let active = true;
        setLatestBlockAt(undefined);
        setLatestBlockError("");
        void publicClient.getBlock()
            .then((block) => { if (active) setLatestBlockAt(block.timestamp); })
            .catch((cause: unknown) => { if (active) setLatestBlockError(errorMessage(cause)); });
        return () => { active = false; };
    }, [blockRetry]);

    useEffect(() => {
        if (!address) {
            setRecords({status: "success", data: []});
            return;
        }
        let active = true;
        setRecords({status: "loading"});
        void loadRecords(address)
            .then((data) => { if (active) setRecords({status: "success", data}); })
            .catch((cause: unknown) => { if (active) setRecords({status: "failed", error: errorMessage(cause)}); });
        return () => { active = false; };
    }, [address, recordsRetry]);

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
            <h2>증서 조회</h2>
            <p className="doc-note">누구의 기록이든 UID 로 열어 볼 수 있습니다. 지갑이 필요 없습니다.</p>
            <form className="doc-form" onSubmit={open}>
                <label htmlFor="home-decision-uid">decisionUID</label>
                <input id="home-decision-uid" className="hex" value={uid} onChange={(event) => setUid(event.target.value)} placeholder="0x…" />
                <button className="btn" type="submit" disabled={!UID_PATTERN.test(uid.trim())}>열기</button>
            </form>
        </section>

        <section className="doc-section"><h2>둘러보기</h2>
            <p className="doc-note">기한초과·결과 등록·철회 이력이 어떻게 보이는지 담은 예시입니다.</p>
            <LoadStateView state={examples} failureText="예시를 불러오지 못했습니다." retry={() => setExamplesRetry(value => value + 1)}>
                {(rows) => <SummaryList rows={rows} />}
            </LoadStateView>
        </section>
        <section className="doc-section"><h2>최근 본 기록</h2>
            <LoadStateView state={recentRows} failureText="최근 본 기록을 불러오지 못했습니다." retry={() => setRecentRetry(value => value + 1)}>
                {(rows) => <ul className="record-list">{rows.map((row) => {
                if (isFailedSummary(row)) return <li className="record-row record-row--failed" key={row.uid}>
                    {row.kind === "missing"
                        ? <span className="doc-note">이 체인에 없는 기록입니다.</span>
                        : <span className="notice" role="alert">! 불러오지 못함</span>}
                    <span className="hex record-row__uid">{row.uid}</span>
                    {row.kind === "lookup-error" && <span className="record-row__detail">
                        {row.error}
                        <button className="btn" type="button" onClick={() => setRecentRetry(value => value + 1)}>다시 시도</button>
                    </span>}
                    <button className="btn-quiet record-row__action" type="button" onClick={() => setRecent(forgetDecision(row.uid))}>기록 지우기</button>
                </li>;
                const visit = recent.find((item) => item.uid.toLowerCase() === row.uid.toLowerCase());
                return <RecordRowView
                    key={row.uid}
                    uid={row.uid}
                    state={row.state}
                    detail={visit ? `마지막 조회 ${new Date(visit.at).toLocaleString("ko-KR")}` : undefined}
                />;
            })}</ul>}
            </LoadStateView>
        </section>

        <section className="doc-section"><details><summary>검증 환경</summary><dl className="doc-fields">
            <dt>체인</dt><dd>{CHAIN.name} · chainId {CHAIN.id}</dd>
            <dt>최신 블록 시각</dt><dd className="hex">{latestBlockError
                ? <>! 확인하지 못했습니다. {latestBlockError} <button className="btn" type="button" onClick={() => setBlockRetry(value => value + 1)}>다시 시도</button></>
                : latestBlockAt === undefined ? "불러오는 중…" : new Date(Number(latestBlockAt) * 1000).toLocaleString("ko-KR")}</dd>
            <dt>컨트랙트</dt><dd>{isDeployed() ? "배포됨" : "설정 필요"}</dd>
            <dt>스키마</dt><dd>{Object.keys(SCHEMAS).join(" · ")}</dd>
            <dt>지표 정의</dt><dd>{METRICS.map((metric) => `${metric.name} · definitionHash ${metric.definitionHash}`).join(" / ")}</dd>
        </dl></details></section>

        {address && <><section className="doc-section"><h2>결과 등록이 필요한 기록</h2>
            <p className="doc-note">관측 구간이 끝나 결과를 남겨야 하는 것들입니다. 유예를 넘기면 「기한초과」로 드러납니다.</p>
            <p className="hex">{address}</p>
            <LoadStateView state={records} emptyText="표시할 기록이 없습니다." failureText="결과 등록이 필요한 기록을 불러오지 못했습니다." retry={() => setRecordsRetry(value => value + 1)}>
                {(rows) => needsAction(rows).length > 0 ? <WalletRows rows={needsAction(rows)} /> : <p className="doc-note">표시할 기록이 없습니다.</p>}
            </LoadStateView>
        </section>
        <section className="doc-section"><h2>내가 남긴 기록</h2>
            <LoadStateView state={records} failureText="내가 남긴 기록을 불러오지 못했습니다." retry={() => setRecordsRetry(value => value + 1)}>
                {(rows) => <WalletRows rows={rows.slice(0, 5)} />}
            </LoadStateView>
            <p><a className="btn" href="#/me">내 기록 전체 →</a></p>
        </section></>}
    </main>;
}
