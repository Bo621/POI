import {useEffect, useState, type FormEvent} from "react";
import {commitment} from "@poi/core";
import {bytesToHex, zeroAddress, type Address, type Hex} from "viem";
import {clockSkewNotice} from "./chainClock";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {attest, encodeDecisionData, type AttestResult, type DecisionFields} from "./eas";
import {Receipt} from "./receipt";
import {SaltBackup} from "./saltBackup";
import {ZERO_UID, type VerificationSnapshot} from "./wallet";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const MAX_GRACE = 30 * DAY;

export interface DecisionForm {
    decision: string;
    trigger: string;
    evidence: string;
    reason: string;
    hasExpectedOutcome: boolean;
    outcomeMetricId: string;
    outcomeOp: number;
    outcomeThreshold: string;
    windowStart: number;
    windowEnd: number;
    graceSeconds: number;
    parents: string[];
    promotedFromNote: string;
    attester: Address;
    verifiedAddressUID: Hex;
    salts: {
        decision: Hex;
        trigger: Hex;
        evidence: Hex;
        reason: Hex;
    };
}

export interface DecisionPayload {
    fields: DecisionFields;
    refUID: Hex;
}

function requireUID(value: string, label: string): Hex {
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
        throw new Error(`${label}는 32바이트 UID여야 합니다.`);
    }
    return value as Hex;
}

export function newSalt(): Hex {
    return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

export function buildDecisionPayload(form: DecisionForm, now = Math.floor(Date.now() / 1000)): DecisionPayload {
    if (!form.decision.trim()) throw new Error("결정 내용을 입력해 주세요.");
    if (!form.trigger.trim()) throw new Error("trigger를 입력해 주세요.");
    if (form.parents.length > 8) throw new Error("부모 UID는 최대 8개까지 입력할 수 있습니다.");
    const parents = form.parents.map((uid, index) => requireUID(uid, `부모 UID ${index + 1}`));
    const promotedFromNote = form.promotedFromNote
        ? requireUID(form.promotedFromNote, "승격 노트 UID")
        : ZERO_UID;

    let outcomeMetricId = ZERO_UID;
    let outcomeOp = 0;
    let outcomeThreshold = 0n;
    let windowStart = 0n;
    let windowEnd = 0n;
    let graceSeconds = 0;
    if (form.hasExpectedOutcome) {
        outcomeMetricId = requireUID(form.outcomeMetricId, "지표 ID");
        if (form.windowStart <= now) throw new Error("관측 구간 시작은 발행 시점 이후여야 합니다.");
        if (form.windowEnd <= form.windowStart) throw new Error("관측 구간 종료는 시작보다 뒤여야 합니다.");
        if (form.graceSeconds < HOUR || form.graceSeconds > MAX_GRACE) {
            throw new Error("유예 기간은 1시간 이상 30일 이하여야 합니다.");
        }
        if (!Number.isInteger(form.outcomeOp) || form.outcomeOp < 0 || form.outcomeOp > 255) {
            throw new Error("결과 연산자가 올바르지 않습니다.");
        }
        try {
            outcomeThreshold = BigInt(form.outcomeThreshold);
        } catch {
            throw new Error("결과 임계값은 정수여야 합니다.");
        }
        outcomeOp = form.outcomeOp;
        windowStart = BigInt(form.windowStart);
        windowEnd = BigInt(form.windowEnd);
        graceSeconds = form.graceSeconds;
    }

    const makeCommitment = (tag: "DECISION" | "TRIGGER" | "EVIDENCE" | "REASON", salt: Hex, payload: string) =>
        commitment({tag, chainId: CHAIN.id, attester: form.attester, salt, payload});
    const evidenceCommitment = form.evidence.trim()
        ? makeCommitment("EVIDENCE", form.salts.evidence, form.evidence)
        : ZERO_UID;
    const reasonCommitment = form.reason.trim()
        ? makeCommitment("REASON", form.salts.reason, form.reason)
        : ZERO_UID;

    return {
        fields: {
            parents,
            promotedFromNote,
            verifiedAddressUID: form.verifiedAddressUID,
            decisionCommitment: makeCommitment("DECISION", form.salts.decision, form.decision),
            triggerCommitment: makeCommitment("TRIGGER", form.salts.trigger, form.trigger),
            evidenceCommitment,
            reasonCommitment,
            hasExpectedOutcome: form.hasExpectedOutcome,
            outcomeMetricId,
            outcomeOp,
            outcomeThreshold,
            windowStart,
            windowEnd,
            graceSeconds,
        },
        refUID: parents[0] ?? ZERO_UID,
    };
}

export function Decision({address, verification, chainNow, skewSeconds, onPublished, onEditingChange}: {
    address?: Address;
    verification: VerificationSnapshot;
    chainNow: bigint | undefined;
    skewSeconds: number | undefined;
    onPublished?: (uid: Hex) => void;
    onEditingChange?: (editing: boolean) => void;
}) {
    const [decision, setDecision] = useState("");
    const [trigger, setTrigger] = useState("");
    const [evidence, setEvidence] = useState("");
    const [reason, setReason] = useState("");
    const [hasOutcome, setHasOutcome] = useState(false);
    const [metricId, setMetricId] = useState("");
    const [op, setOp] = useState(0);
    const [threshold, setThreshold] = useState("0");
    const [windowStart, setWindowStart] = useState<number>();
    const [windowEnd, setWindowEnd] = useState<number>();
    const [grace, setGrace] = useState(DAY);
    const [parentsText, setParentsText] = useState("");
    const [promoted, setPromoted] = useState("");
    const [pending, setPending] = useState<DecisionForm>();
    const [receipt, setReceipt] = useState<AttestResult>();
    const [status, setStatus] = useState("");

    useEffect(() => {
        if (chainNow === undefined) return;
        const initialNow = Number(chainNow);
        setWindowStart((value) => value ?? initialNow + 300);
        setWindowEnd((value) => value ?? initialNow + 3900);
    }, [chainNow]);

    useEffect(() => {
        onEditingChange?.(
            decision.trim().length > 0
            || trigger.trim().length > 0
            || evidence.trim().length > 0
            || reason.trim().length > 0
            || parentsText.trim().length > 0
            || promoted.trim().length > 0
            || hasOutcome,
        );
    }, [decision, trigger, evidence, reason, parentsText, promoted, hasOutcome, onEditingChange]);

    function prepare(event: FormEvent) {
        event.preventDefault();
        setStatus("");
        if (chainNow === undefined || windowStart === undefined || windowEnd === undefined) return;
        const salts = {decision: newSalt(), trigger: newSalt(), evidence: newSalt(), reason: newSalt()};
        const form: DecisionForm = {
            decision,
            trigger,
            evidence,
            reason,
            hasExpectedOutcome: hasOutcome,
            outcomeMetricId: metricId,
            outcomeOp: op,
            outcomeThreshold: threshold,
            windowStart,
            windowEnd,
            graceSeconds: grace,
            parents: parentsText.split(/\s+/).filter(Boolean),
            promotedFromNote: promoted.trim(),
            attester: address ?? zeroAddress,
            verifiedAddressUID: verification.verifiedAddressUID,
            salts,
        };
        try {
            buildDecisionPayload(form, Number(chainNow));
            setPending(form);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "입력값을 확인해 주세요.");
        }
    }

    async function publish() {
        if (!pending || !address || !isDeployed() || chainNow === undefined) return;
        try {
            const payload = buildDecisionPayload({...pending, attester: address}, Number(chainNow));
            const result = await attest({
                schema: SCHEMAS.decision as Hex,
                data: encodeDecisionData(payload.fields),
                revocable: false,
                refUID: payload.refUID,
            });
            setReceipt(result);
            setStatus("");
            setPending(undefined);
            if (onPublished) window.setTimeout(() => onPublished(result.uid), 250);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "발행에 실패했습니다.");
        }
    }

    const skewNotice = clockSkewNotice(skewSeconds);

    return (
        <section className="doc-section">
            <h2>결정 커밋</h2>
            <p className="notice notice--quiet">trigger는 온체인에서 강제되지 않습니다.</p>
            <div className="notice">
                <p>아래 항목은 평문으로 온체인에 기록됩니다.</p>
                <dl className="doc-fields">
                    <dt>predicate</dt><dd className="hex">metricId · op · threshold</dd>
                    <dt>관측 조건</dt><dd className="hex">window · graceSeconds</dd>
                    <dt>참조</dt><dd className="hex">parents · promotedFromNote · verifiedAddressUID</dd>
                </dl>
            </div>
            <form className="doc-form" onSubmit={prepare}>
                <div className="field-group">
                    <div className="field"><label htmlFor="decision-content">결정 내용</label><textarea id="decision-content" rows={6} value={decision} onChange={(e) => setDecision(e.target.value)} /></div>
                    <div className="field"><label htmlFor="decision-trigger">trigger</label><textarea id="decision-trigger" rows={3} value={trigger} onChange={(e) => setTrigger(e.target.value)} /></div>
                </div>
                <details className="field-group">
                    <summary>근거 · 이유 (선택)</summary>
                    <div className="field"><label htmlFor="decision-evidence">근거 (선택)</label><textarea id="decision-evidence" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></div>
                    <div className="field"><label htmlFor="decision-reason">이유 (선택)</label><textarea id="decision-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                </details>
                <details className="field-group">
                    <summary>예상 결과 선언 (선택)</summary>
                    <label className="check-field" htmlFor="decision-outcome">
                        <input id="decision-outcome" type="checkbox" checked={hasOutcome} onChange={(e) => setHasOutcome(e.target.checked)} />
                        예상 결과 선언
                    </label>
                    {hasOutcome && (
                        <fieldset>
                            <legend>예상 결과 조건</legend>
                            <div className="field"><label htmlFor="decision-metric">metricId</label><input className="uid" id="decision-metric" value={metricId} onChange={(e) => setMetricId(e.target.value)} /></div>
                            <div className="field"><label htmlFor="decision-op">op</label><input id="decision-op" type="number" min="0" max="255" value={op} onChange={(e) => setOp(Number(e.target.value))} /></div>
                            <div className="field"><label htmlFor="decision-threshold">threshold</label><input id="decision-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
                            <div className="field"><label htmlFor="decision-window-start">windowStart (Unix 초)</label><input id="decision-window-start" type="number" value={windowStart ?? ""} onChange={(e) => setWindowStart(Number(e.target.value))} /></div>
                            <div className="field"><label htmlFor="decision-window-end">windowEnd (Unix 초)</label><input id="decision-window-end" type="number" value={windowEnd ?? ""} onChange={(e) => setWindowEnd(Number(e.target.value))} /></div>
                            <div className="field"><label htmlFor="decision-grace">graceSeconds</label><input id="decision-grace" type="number" value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></div>
                        </fieldset>
                    )}
                </details>
                <details className="field-group">
                    <summary>계보 (선택)</summary>
                    <div className="field"><label htmlFor="decision-parents">부모 UID (공백/줄바꿈 구분, 최대 8)</label><textarea className="hex" id="decision-parents" rows={2} value={parentsText} onChange={(e) => setParentsText(e.target.value)} /></div>
                    <div className="field"><label htmlFor="decision-promoted">승격 노트 UID (선택)</label><input className="uid" id="decision-promoted" value={promoted} onChange={(e) => setPromoted(e.target.value)} /></div>
                </details>
                <button className="btn" type="submit" disabled={!isDeployed() || chainNow === undefined}>salt 생성 및 백업</button>
            </form>
            {!address && <p className="notice notice--quiet">지갑을 연결해야 결정 기록을 발행할 수 있습니다.</p>}
            {chainNow === undefined && <p className="doc-note">체인 시각을 확인하는 중입니다.</p>}
            {skewNotice && <p className="notice--quiet">{skewNotice}</p>}
            {status && <p className="form-status" role="alert">{status}</p>}
            <Receipt label="결정 커밋" uid={receipt?.uid} txHash={receipt?.txHash} />
            {pending && (
                <SaltBackup
                    salts={pending.salts}
                    payload={{
                        decision: pending.decision,
                        trigger: pending.trigger,
                        evidence: pending.evidence,
                        reason: pending.reason,
                    }}
                    onCancel={() => setPending(undefined)}
                    onProceed={publish}
                    publishDisabled={!address}
                    publishDisabledReason="결정 기록을 발행하려면 지갑을 연결해 주세요."
                />
            )}
        </section>
    );
}
