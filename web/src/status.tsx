import {
    STATE,
    deriveState,
    evidenceTier,
    formatGrade,
    REVEAL_STATE,
    type PoiState,
} from "@poi/core";
import {useEffect, useState, type FormEvent} from "react";
import type {Hex} from "viem";
import {SCHEMAS, isDeployed} from "./config";
import {getChainTime, readDecision, readSettlement, readSettlementHeads} from "./read";
import {ZERO_UID} from "./wallet";

export function clockSkewNotice(chainNow: bigint, browserNow: bigint): string | undefined {
    const difference = chainNow >= browserNow ? chainNow - browserNow : browserNow - chainNow;
    if (difference < 60n) return undefined;
    return `기기 시각이 체인과 ${difference}초 차이납니다. 표시는 체인 시각을 기준으로 합니다.`;
}

export function describeState(state: PoiState): string {
    const labels: Record<PoiState, string> = {
        [STATE.NOT_REQUIRED]: "예상 결과 없음",
        [STATE.PENDING]: "구간 시작 전",
        [STATE.OBSERVING]: "관측 중",
        [STATE.AWAITING]: "정산 대기",
        [STATE.OVERDUE]: "정산 기한 초과",
        [STATE.SETTLED]: "정산됨",
        [STATE.SETTLED_LATE]: "정산됨(기한 후)",
    };
    return labels[state];
}

interface LoadedStatus {
    hasExpectedOutcome: boolean;
    windowStart: bigint;
    windowEnd: bigint;
    graceSeconds: bigint;
    activeHead: Hex;
    activeHeadTime?: bigint;
    revokeCount: number;
    grade: string;
}

export function Status() {
    const [decisionUID, setDecisionUID] = useState("");
    const [loaded, setLoaded] = useState<LoadedStatus>();
    const [now, setNow] = useState<bigint>();
    const [error, setError] = useState("");

    useEffect(() => {
        const tick = window.setInterval(() => setNow((value) => value === undefined ? value : value + 1n), 1000);
        const sync = window.setInterval(() => {
            void getChainTime().then(setNow).catch(() => undefined);
        }, 15_000);
        return () => {
            window.clearInterval(tick);
            window.clearInterval(sync);
        };
    }, []);

    async function load(event: FormEvent) {
        event.preventDefault();
        setError("");
        try {
            if (!/^0x[0-9a-fA-F]{64}$/.test(decisionUID)) throw new Error("결정 UID를 확인해 주세요.");
            const uid = decisionUID as Hex;
            const [decision, heads, chainTime] = await Promise.all([
                readDecision(uid),
                readSettlementHeads(SCHEMAS.settlement as Hex, uid),
                getChainTime(),
            ]);
            const active = heads.activeHead === ZERO_UID ? undefined : await readSettlement(heads.activeHead);
            setNow(chainTime);
            setLoaded({
                hasExpectedOutcome: decision.hasExpectedOutcome,
                windowStart: decision.windowStart,
                windowEnd: decision.windowEnd,
                graceSeconds: BigInt(decision.graceSeconds),
                activeHead: heads.activeHead,
                activeHeadTime: active?.time,
                revokeCount: heads.revokeCount,
                grade: formatGrade(evidenceTier(decision.evidenceCommitment), REVEAL_STATE.SEALED),
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "상태를 불러오지 못했습니다.");
        }
    }

    const result = loaded && now !== undefined ? deriveState(loaded, now) : undefined;
    const skewNotice = now === undefined
        ? undefined
        : clockSkewNotice(now, BigInt(Math.floor(Date.now() / 1000)));
    const seal = result ? {
        [STATE.NOT_REQUIRED]: {text: "해당없음", tone: "faint", label: "해당 없음"},
        [STATE.PENDING]: {text: "대기", tone: "ink", label: "대기"},
        [STATE.OBSERVING]: {text: "관측중", tone: "ink", label: "관측 중"},
        [STATE.AWAITING]: {text: "정산대기", tone: "ink", label: "정산 대기"},
        [STATE.OVERDUE]: {text: "기한초과", tone: "seal", label: "기한 초과"},
        [STATE.SETTLED]: {text: "정산완료", tone: "indigo", label: "정산 완료"},
        [STATE.SETTLED_LATE]: {text: "지연정산", tone: "indigo", label: "지연 정산"},
    }[result.state] : undefined;
    return (
        <section className="doc-section">
            <h2>상태</h2>
            <form className="doc-form" onSubmit={load}>
                <div className="field"><label htmlFor="status-decision">decisionUID</label><input className="uid" id="status-decision" value={decisionUID} onChange={(e) => setDecisionUID(e.target.value)} /></div>
                <button className="btn" type="submit" disabled={!isDeployed()}>상태 조회</button>
            </form>
            {!result && (
                <div className="status-empty">
                    <div className="seal seal--empty" aria-hidden="true">미조회</div>
                    <p className="doc-note">decisionUID를 넣으면 7상태 중 하나가 인장으로 표시됩니다.</p>
                </div>
            )}
            {result && seal && (
                <div className="status-result">
                    <div
                        className={`seal seal--${seal.tone} seal--stamping`}
                        role="img"
                        aria-label={`상태: ${seal.label}`}
                    >
                        {seal.text}
                    </div>
                    <dl className="doc-fields">
                        <dt>상태</dt><dd>{describeState(result.state)}</dd>
                        {loaded && <><dt>등급</dt><dd>{loaded.grade}</dd></>}
                    </dl>
                </div>
            )}
            {result && <>
                <p className="doc-note">왼쪽은 근거 첨부 여부, 오른쪽은 공개 여부입니다. 둘은 독립입니다.</p>
                <p className="doc-note">공개 여부는 reveals/에 올라온 파일을 사람이 확인해야 합니다. 이 화면은 항상 SEALED로 표시합니다.</p>
            </>}
            {result?.hasRevokedSettlement && <p className="revocation-note">정산 철회 이력 있음</p>}
            {skewNotice && <p className="notice--quiet">{skewNotice}</p>}
            {error && <p className="form-status" role="alert">{error}</p>}
        </section>
    );
}
