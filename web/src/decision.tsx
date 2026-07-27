import {useState, type FormEvent} from "react";
import {commitment, messageFromRevert} from "@poi/core";
import {bytesToHex, isHex, type Address, type Hex} from "viem";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {attest, encodeDecisionData, type DecisionFields} from "./eas";
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

function revertMessage(error: unknown): string {
    const data = (error as {data?: unknown})?.data;
    if (typeof data === "string" && isHex(data)) {
        return messageFromRevert(data) ?? "발행에 실패했습니다.";
    }
    const nestedData = (error as {cause?: {data?: unknown}})?.cause?.data;
    if (typeof nestedData === "string" && isHex(nestedData)) {
        return messageFromRevert(nestedData) ?? "발행에 실패했습니다.";
    }
    return error instanceof Error ? error.message : "발행에 실패했습니다.";
}

export function Decision({address, verification}: {
    address?: Address;
    verification: VerificationSnapshot;
}) {
    const now = Math.floor(Date.now() / 1000);
    const [decision, setDecision] = useState("");
    const [trigger, setTrigger] = useState("");
    const [evidence, setEvidence] = useState("");
    const [reason, setReason] = useState("");
    const [hasOutcome, setHasOutcome] = useState(false);
    const [metricId, setMetricId] = useState("");
    const [op, setOp] = useState(0);
    const [threshold, setThreshold] = useState("0");
    const [windowStart, setWindowStart] = useState(now + 300);
    const [windowEnd, setWindowEnd] = useState(now + 3900);
    const [grace, setGrace] = useState(DAY);
    const [parentsText, setParentsText] = useState("");
    const [promoted, setPromoted] = useState("");
    const [pending, setPending] = useState<DecisionForm>();
    const [status, setStatus] = useState("");

    function prepare(event: FormEvent) {
        event.preventDefault();
        setStatus("");
        if (!address) {
            setStatus("먼저 지갑을 연결해 주세요.");
            return;
        }
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
            attester: address,
            verifiedAddressUID: verification.verifiedAddressUID,
            salts,
        };
        try {
            buildDecisionPayload(form);
            setPending(form);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "입력값을 확인해 주세요.");
        }
    }

    async function publish() {
        if (!pending || !isDeployed()) return;
        try {
            const payload = buildDecisionPayload(pending);
            const hash = await attest({
                schema: SCHEMAS.decision as Hex,
                data: encodeDecisionData(payload.fields),
                revocable: false,
                refUID: payload.refUID,
            });
            setStatus(`발행 트랜잭션: ${hash}`);
            setPending(undefined);
        } catch (error) {
            setStatus(revertMessage(error));
        }
    }

    return (
        <section>
            <h2>결정 커밋</h2>
            <p>trigger는 온체인에서 강제할 수 없습니다.</p>
            <p>
                온체인에 평문으로 공개: predicate(metricId·op·threshold), window, graceSeconds,
                parents, promotedFromNote, verifiedAddressUID
            </p>
            <form onSubmit={prepare}>
                <label>결정 내용<textarea value={decision} onChange={(e) => setDecision(e.target.value)} /></label>
                <label>trigger<textarea value={trigger} onChange={(e) => setTrigger(e.target.value)} /></label>
                <label>근거 (선택)<textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
                <label>이유 (선택)<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <label>
                    <input type="checkbox" checked={hasOutcome} onChange={(e) => setHasOutcome(e.target.checked)} />
                    예상 결과 선언
                </label>
                {hasOutcome && (
                    <fieldset>
                        <label>metricId<input value={metricId} onChange={(e) => setMetricId(e.target.value)} /></label>
                        <label>op<input type="number" min="0" max="255" value={op} onChange={(e) => setOp(Number(e.target.value))} /></label>
                        <label>threshold<input value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
                        <label>windowStart (Unix 초)<input type="number" value={windowStart} onChange={(e) => setWindowStart(Number(e.target.value))} /></label>
                        <label>windowEnd (Unix 초)<input type="number" value={windowEnd} onChange={(e) => setWindowEnd(Number(e.target.value))} /></label>
                        <label>graceSeconds<input type="number" min={HOUR} max={MAX_GRACE} value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></label>
                    </fieldset>
                )}
                <label>부모 UID (공백/줄바꿈 구분, 최대 8)<textarea value={parentsText} onChange={(e) => setParentsText(e.target.value)} /></label>
                <label>승격 노트 UID (선택)<input value={promoted} onChange={(e) => setPromoted(e.target.value)} /></label>
                <button type="submit" disabled={!isDeployed()}>salt 생성 및 백업</button>
            </form>
            {status && <p role="alert">{status}</p>}
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
                />
            )}
        </section>
    );
}
