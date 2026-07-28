import {
    decodeEventLog,
    encodeAbiParameters,
    parseAbi,
    type Address,
    type Hex,
} from "viem";
import {EAS_ADDRESS} from "./config";
import {getWalletClient, publicClient} from "./chain";

export interface DecisionFields {
    parents: Hex[];
    promotedFromNote: Hex;
    verifiedAddressUID: Hex;
    decisionCommitment: Hex;
    triggerCommitment: Hex;
    evidenceCommitment: Hex;
    reasonCommitment: Hex;
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowStart: bigint;
    windowEnd: bigint;
    graceSeconds: number;
}

const NOTE_PARAMETERS = [{type: "bytes32", name: "contentCommitment"}] as const;
export const DECISION_PARAMETERS = [
    {type: "bytes32[]", name: "parents"},
    {type: "bytes32", name: "promotedFromNote"},
    {type: "bytes32", name: "verifiedAddressUID"},
    {type: "bytes32", name: "decisionCommitment"},
    {type: "bytes32", name: "triggerCommitment"},
    {type: "bytes32", name: "evidenceCommitment"},
    {type: "bytes32", name: "reasonCommitment"},
    {type: "bool", name: "hasExpectedOutcome"},
    {type: "bytes32", name: "outcomeMetricId"},
    {type: "uint8", name: "outcomeOp"},
    {type: "int128", name: "outcomeThreshold"},
    {type: "uint64", name: "windowStart"},
    {type: "uint64", name: "windowEnd"},
    {type: "uint32", name: "graceSeconds"},
] as const;

export function encodeNoteData(contentCommitment: Hex): Hex {
    return encodeAbiParameters(NOTE_PARAMETERS, [contentCommitment]);
}

export function encodeDecisionData(d: DecisionFields): Hex {
    return encodeAbiParameters(DECISION_PARAMETERS, [
        d.parents,
        d.promotedFromNote,
        d.verifiedAddressUID,
        d.decisionCommitment,
        d.triggerCommitment,
        d.evidenceCommitment,
        d.reasonCommitment,
        d.hasExpectedOutcome,
        d.outcomeMetricId,
        d.outcomeOp,
        d.outcomeThreshold,
        d.windowStart,
        d.windowEnd,
        d.graceSeconds,
    ]);
}

const EAS_ABI = parseAbi([
    "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)",
    "function revoke((bytes32 schema,(bytes32 uid,uint256 value) data) request) payable",
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
]);

export interface AttestResult {
    uid: Hex;
    txHash: Hex;
}

export async function attest(args: {
    schema: Hex;
    data: Hex;
    revocable: boolean;
    refUID: Hex;
}): Promise<AttestResult> {
    const wallet = getWalletClient();
    const [account] = await wallet.requestAddresses();
    const txHash = await wallet.writeContract({
        address: EAS_ADDRESS as Address,
        abi: EAS_ABI,
        functionName: "attest",
        account,
        args: [{
            schema: args.schema,
            data: {
                recipient: "0x0000000000000000000000000000000000000000",
                expirationTime: 0n,
                revocable: args.revocable,
                refUID: args.refUID,
                data: args.data,
                value: 0n,
            },
        }],
        value: 0n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});
    for (const log of receipt.logs) {
        try {
            const decoded = decodeEventLog({
                abi: EAS_ABI,
                eventName: "Attested",
                data: log.data,
                topics: log.topics,
            });
            return {uid: decoded.args.uid, txHash};
        } catch {
            // 다른 컨트랙트의 로그는 건너뛴다.
        }
    }
    throw new Error("발행 영수증에서 UID를 찾지 못했습니다.");
}

export async function revoke(args: {schema: Hex; uid: Hex}): Promise<{txHash: Hex}> {
    const wallet = getWalletClient();
    const [account] = await wallet.requestAddresses();
    const txHash = await wallet.writeContract({
        address: EAS_ADDRESS as Address,
        abi: EAS_ABI,
        functionName: "revoke",
        account,
        args: [{schema: args.schema, data: {uid: args.uid, value: 0n}}],
        value: 0n,
    });
    return {txHash};
}
