import {messageFromRevert, RESULT, scale, settlementResult, type Op, type Result} from "@poi/core";
import {useState, type FormEvent} from "react";
import {encodeAbiParameters, isHex, parseAbi, type Address, type Hex} from "viem";
import {getWalletClient} from "./chain";
import {EAS_ADDRESS, SCHEMAS, isDeployed} from "./config";
import {attest} from "./eas";
import {readDecision, readMetricDecimals, readSettlementHeads} from "./read";
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
const REVOKE_ABI = parseAbi([
    "function revoke((bytes32 schema,(bytes32 uid,uint256 value) data) request) payable",
]);

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

export function Settlement({address}: {address?: Address}) {
    const [decisionUID, setDecisionUID] = useState("");
    const [observedValue, setObservedValue] = useState("");
    const [missing, setMissing] = useState(false);
    const [source, setSource] = useState("");
    const [verifierVersion, setVerifierVersion] = useState("");
    const [prepared, setPrepared] = useState<SettlementPayload>();
    const [decision, setDecision] = useState<SettlementDecision>();
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
            if (!address || record.attester.toLowerCase() !== address.toLowerCase()) {
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
            const hash = await attest({
                schema: SCHEMAS.settlement as Hex,
                data: encode(prepared),
                revocable: true,
                refUID: prepared.decisionUID,
            });
            setStatus(`정산 발행 트랜잭션: ${hash}`);
        } catch (error) {
            setStatus(errorMessage(error));
        }
    }

    async function revoke() {
        if (!prepared) return;
        try {
            const heads = await readSettlementHeads(SCHEMAS.settlement as Hex, prepared.decisionUID);
            if (heads.activeHead === ZERO_UID) throw new Error("활성 정산이 없습니다.");
            const wallet = getWalletClient();
            const [account] = await wallet.requestAddresses();
            const hash = await wallet.writeContract({
                address: EAS_ADDRESS as Address,
                abi: REVOKE_ABI,
                functionName: "revoke",
                account,
                args: [{schema: SCHEMAS.settlement as Hex, data: {uid: heads.activeHead, value: 0n}}],
                value: 0n,
            });
            setStatus(`철회 트랜잭션: ${hash}`);
        } catch (error) {
            setStatus(errorMessage(error));
        }
    }

    return (
        <section>
            <h2>정산</h2>
            <p>관측 시점: 구간 종료 시각(고정)</p>
            <p>결과는 관측값으로부터 컨트랙트가 판정합니다. 직접 고를 수 없습니다.</p>
            <form onSubmit={prepare}>
                <label>decisionUID<input value={decisionUID} onChange={(e) => setDecisionUID(e.target.value)} /></label>
                <label><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} />관측값 없음</label>
                {!missing && <label>관측값<input value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></label>}
                <label>출처<input value={source} onChange={(e) => setSource(e.target.value)} /></label>
                <label>verifierVersion<input value={verifierVersion} onChange={(e) => setVerifierVersion(e.target.value)} /></label>
                <button type="submit" disabled={!isDeployed()}>정산 확인</button>
            </form>
            {prepared && <p>판정: {prepared.result === RESULT.OBSERVED ? "OBSERVED" : prepared.result === RESULT.NOT_OBSERVED ? "NOT_OBSERVED" : "INDETERMINATE"}</p>}
            {prepared && prepared.supersedes !== ZERO_UID && <p>철회된 이전 정산 {prepared.supersedes}을 자동으로 정정합니다.</p>}
            <button type="button" onClick={publish} disabled={!prepared?.canPublish || !isDeployed()}>정산 발행</button>
            <button type="button" onClick={revoke} disabled={!prepared || !isDeployed()}>활성 정산 철회</button>
            {decision && <p>구간 종료: {decision.windowEnd.toString()}</p>}
            {status && <p role="alert">{status}</p>}
        </section>
    );
}
