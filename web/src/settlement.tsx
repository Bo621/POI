import {messageFromRevert, RESULT, scale, settlementResult, type Op, type Result} from "@poi/core";
import {useState, type FormEvent} from "react";
import {encodeAbiParameters, isHex, type Address, type Hex} from "viem";
import {SCHEMAS, isDeployed} from "./config";
import {attest, revoke as revokeAttestation, type AttestResult} from "./eas";
import {readDecision, readMetricDecimals, readSettlementHeads} from "./read";
import {Receipt} from "./receipt";
import {ZERO_UID} from "./wallet";

export interface SettlementDecision {
    attester: Address;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowEnd: bigint;
}

export interface SettlementForm {
    decisionUID: Hex;
    hasObservedValue: boolean;
    observedValue: string;
    source: string;
    verifierVersion: string;
    activeHead: Hex;
    lastHead: Hex;
}

export interface SettlementPayload {
    decisionUID: Hex;
    result: Result;
    hasObservedValue: boolean;
    observedValue: bigint;
    source: string;
    observedAt: bigint;
    verifierVersion: string;
    supersedes: Hex;
    canPublish: boolean;
}

const PARAMETERS = [
    {type: "bytes32"}, {type: "uint8"}, {type: "bool"}, {type: "int128"},
    {type: "string"}, {type: "uint64"}, {type: "string"}, {type: "bytes32"},
] as const;
export function buildSettlementPayload(
    form: SettlementForm,
    decision: SettlementDecision,
    decimals: number,
): SettlementPayload {
    const observedValue = form.hasObservedValue ? scale(form.observedValue, decimals) : 0n;
    const result = settlementResult({
        hasObservedValue: form.hasObservedValue,
        scaledValue: form.hasObservedValue ? observedValue : undefined,
        op: decision.outcomeOp as Op,
        threshold: decision.outcomeThreshold,
    });
    return {
        decisionUID: form.decisionUID,
        result,
        hasObservedValue: form.hasObservedValue,
        observedValue,
        source: form.source,
        observedAt: decision.windowEnd,
        verifierVersion: form.verifierVersion,
        supersedes: form.activeHead === ZERO_UID ? form.lastHead : ZERO_UID,
        canPublish: form.activeHead === ZERO_UID,
    };
}

function encode(payload: SettlementPayload): Hex {
    return encodeAbiParameters(PARAMETERS, [
        payload.decisionUID, payload.result, payload.hasObservedValue, payload.observedValue,
        payload.source, payload.observedAt, payload.verifierVersion, payload.supersedes,
    ]);
}

function errorMessage(error: unknown): string {
    const candidate = error as {data?: unknown; cause?: {data?: unknown}};
    const data = typeof candidate.data === "string" ? candidate.data : candidate.cause?.data;
    return typeof data === "string" && isHex(data)
        ? messageFromRevert(data) ?? "정산 발행에 실패했습니다."
        : error instanceof Error ? error.message : "정산 발행에 실패했습니다.";
}

export function Settlement({address, decisionUID, onSuccess}: {
    address?: Address;
    decisionUID: Hex;
    onSuccess?: () => void;
}) {
    const [observedValue, setObservedValue] = useState("");
    const [missing, setMissing] = useState(false);
    const [source, setSource] = useState("");
    const [verifierVersion, setVerifierVersion] = useState("");
    const [prepared, setPrepared] = useState<SettlementPayload>();
    const [decision, setDecision] = useState<SettlementDecision>();
    const [receipt, setReceipt] = useState<AttestResult>();
    const [revokeTxHash, setRevokeTxHash] = useState<Hex>();
    const [status, setStatus] = useState("");

    async function prepare(event: FormEvent) {
        event.preventDefault();
        setStatus("");
        try {
            if (!/^0x[0-9a-fA-F]{64}$/.test(decisionUID)) throw new Error("결정 UID를 확인해 주세요.");
            const uid = decisionUID as Hex;
            const [record, heads] = await Promise.all([
                readDecision(uid),
                readSettlementHeads(SCHEMAS.settlement as Hex, uid),
            ]);
            if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
            if (record.attester.toLowerCase() !== address.toLowerCase()) {
                throw new Error("결정 작성자만 정산할 수 있습니다.");
            }
            const decimals = await readMetricDecimals(SCHEMAS.decision as Hex, record.outcomeMetricId);
            const decisionData = {
                attester: record.attester,
                outcomeOp: record.outcomeOp,
                outcomeThreshold: record.outcomeThreshold,
                windowEnd: record.windowEnd,
            };
            const payload = buildSettlementPayload({
                decisionUID: uid,
                hasObservedValue: !missing,
                observedValue,
                source,
                verifierVersion,
                activeHead: heads.activeHead,
                lastHead: heads.lastHead,
            }, decisionData, decimals);
            setDecision(decisionData);
            setPrepared(payload);
            if (!payload.canPublish) setStatus("먼저 기존 정산을 철회해야 합니다.");
        } catch (error) {
            setPrepared(undefined);
            setStatus(errorMessage(error));
        }
    }

    async function publish() {
        if (!prepared?.canPublish || !isDeployed()) return;
        try {
            const result = await attest({
                schema: SCHEMAS.settlement as Hex,
                data: encode(prepared),
                revocable: true,
                refUID: prepared.decisionUID,
            });
            setReceipt(result);
            setStatus("");
            onSuccess?.();
        } catch (error) {
            setStatus(errorMessage(error));
        }
    }

    async function revoke() {
        if (!prepared) return;
        try {
            const heads = await readSettlementHeads(SCHEMAS.settlement as Hex, prepared.decisionUID);
            if (heads.activeHead === ZERO_UID) throw new Error("활성 정산이 없습니다.");
            const result = await revokeAttestation({schema: SCHEMAS.settlement as Hex, uid: heads.activeHead});
            setRevokeTxHash(result.txHash);
            setStatus("");
            onSuccess?.();
        } catch (error) {
            setStatus(errorMessage(error));
        }
    }

    return (
        <section>
            <p className="doc-note">관측 시점: 구간 종료 시각(고정)</p>
            <p className="notice notice--quiet">결과는 관측값으로부터 컨트랙트가 판정합니다. 직접 고를 수 없습니다.</p>
            <form className="doc-form" onSubmit={prepare}>
                <label className="check-field" htmlFor="settlement-missing"><input id="settlement-missing" type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />관측값 없음</label>
                {!missing && <div className="field"><label htmlFor="settlement-value">관측값</label><input id="settlement-value" value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></div>}
                <div className="field"><label htmlFor="settlement-source">출처</label><input id="settlement-source" value={source} onChange={(e) => setSource(e.target.value)} /></div>
                <div className="field"><label htmlFor="settlement-version">verifierVersion</label><input id="settlement-version" value={verifierVersion} onChange={(e) => setVerifierVersion(e.target.value)} /></div>
                <button className="btn" type="submit" disabled={!isDeployed()}>정산 확인</button>
            </form>
            {prepared && <dl className="doc-fields"><dt>판정</dt><dd>{prepared.result === RESULT.OBSERVED ? "OBSERVED" : prepared.result === RESULT.NOT_OBSERVED ? "NOT_OBSERVED" : "INDETERMINATE"}</dd></dl>}
            {prepared && prepared.supersedes !== ZERO_UID && <p>철회된 이전 정산 <span className="hex">{prepared.supersedes}</span>을 자동으로 정정합니다.</p>}
            {!address && <p className="notice notice--quiet">지갑을 연결해야 정산을 발행할 수 있습니다.</p>}
            <div className="button-row">
                <button className="btn-commit" type="button" onClick={publish} disabled={!address || !prepared?.canPublish || !isDeployed()}>정산 발행</button>
                <button className="btn-quiet" type="button" onClick={revoke} disabled={!prepared || !isDeployed()}>활성 정산 철회</button>
            </div>
            {decision && <dl className="doc-fields"><dt>구간 종료</dt><dd className="hex">{decision.windowEnd.toString()}</dd></dl>}
            {status && <p className="form-status" role="alert">{status}</p>}
            <Receipt label="정산" uid={receipt?.uid} txHash={receipt?.txHash} />
            <Receipt label="정산 철회" txHash={revokeTxHash} />
        </section>
    );
}
