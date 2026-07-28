import {
    decodeAbiParameters,
    parseAbi,
    parseAbiItem,
    type Address,
    type Hex,
} from "viem";
import {publicClient, withRetry} from "./chain";
import {
    DOJANG_ADDRESS,
    EAS_ADDRESS,
    SCHEMAS,
    SCHEMA_REGISTRY_ADDRESS,
    UPBIT_KOREA_ID,
} from "./config";
import {DECISION_PARAMETERS, type DecisionFields} from "./eas";
import type {CommitTagName} from "@poi/core";

export type DecisionCommitTag = Exclude<CommitTagName, "NOTE">;

const REGISTRY_ABI = parseAbi([
    "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
]);
const SETTLEMENT_RESOLVER_ABI = parseAbi([
    "function activeHead(bytes32 decisionUID) view returns (bytes32)",
    "function lastHead(bytes32 decisionUID) view returns (bytes32)",
    "function revokeCount(bytes32 decisionUID) view returns (uint32)",
]);
const DECISION_RESOLVER_ABI = parseAbi([
    "function metrics(bytes32 metricId) view returns (bool allowed,uint8 decimals,uint8 kind,bytes32 definitionHash,bool frozen)",
]);
const DOJANG_ABI = parseAbi([
    "function isVerified(address account, bytes32 identity) view returns (bool)",
]);
const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
]);
const ATTESTED_EVENT = parseAbiItem(
    "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
);

export async function getChainTime(): Promise<bigint> {
    const block = await withRetry(() => publicClient.getBlock());
    return block.timestamp;
}

export interface AttestationRecord {
    uid: Hex;
    schema: Hex;
    time: bigint;
    expirationTime: bigint;
    revocationTime: bigint;
    refUID: Hex;
    recipient: Address;
    attester: Address;
    revocable: boolean;
    data: Hex;
}

export interface ChallengeLog {
    uid: Hex;
    attester: Address;
    refUID: Hex;
    revocationTime: bigint;
    claimedResult?: number;
    source?: string;
}

const SETTLEMENT_PARAMETERS = [
    {type: "bytes32", name: "decisionUID"},
    {type: "uint8", name: "result"},
    {type: "bool", name: "hasObservedValue"},
    {type: "int128", name: "observedValue"},
    {type: "string", name: "source"},
    {type: "uint64", name: "observedAt"},
    {type: "string", name: "verifierVersion"},
    {type: "bytes32", name: "supersedes"},
] as const;
const CHALLENGE_PARAMETERS = [
    {type: "bytes32"}, {type: "uint8"}, {type: "bool"}, {type: "int128"},
    {type: "string"}, {type: "uint64"}, {type: "bytes32"},
] as const;

async function resolverFor(schema: Hex): Promise<Address> {
    const record = await withRetry(() => publicClient.readContract({
        address: SCHEMA_REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "getSchema",
        args: [schema],
    }));
    return record.resolver;
}

export async function getAttestation(uid: Hex): Promise<AttestationRecord> {
    return withRetry(() => publicClient.readContract({
        address: EAS_ADDRESS,
        abi: EAS_ABI,
        functionName: "getAttestation",
        args: [uid],
    })) as Promise<AttestationRecord>;
}

export async function readRevealTarget(uid: Hex, tag: DecisionCommitTag): Promise<{
    attester: Address;
    commitment: Hex;
}> {
    let attestation: AttestationRecord;
    try {
        attestation = await getAttestation(uid);
    } catch {
        throw new Error("해당 attestation을 찾을 수 없습니다.");
    }
    if (attestation.uid.toLowerCase() !== uid.toLowerCase()) {
        throw new Error("해당 attestation을 찾을 수 없습니다.");
    }
    if (attestation.schema.toLowerCase() !== SCHEMAS.decision.toLowerCase()) {
        throw new Error("결정 스키마의 attestation이 아닙니다.");
    }
    const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
    const commitmentIndex: Record<DecisionCommitTag, number> = {
        DECISION: 3,
        TRIGGER: 4,
        EVIDENCE: 5,
        REASON: 6,
    };
    return {
        attester: attestation.attester,
        commitment: values[commitmentIndex[tag]] as Hex,
    };
}

export async function readDecision(uid: Hex): Promise<DecisionFields & {
    uid: Hex;
    attester: Address;
    time: bigint;
}> {
    const attestation = await getAttestation(uid);
    const values = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
    const fields = Object.fromEntries(
        DECISION_PARAMETERS.map((parameter, index) => [parameter.name, values[index]]),
    ) as unknown as DecisionFields;
    return {...fields, uid, attester: attestation.attester, time: attestation.time};
}

export async function readSettlement(uid: Hex) {
    const attestation = await getAttestation(uid);
    const values = decodeAbiParameters(SETTLEMENT_PARAMETERS, attestation.data);
    return {
        uid,
        time: attestation.time,
        attester: attestation.attester,
        decisionUID: values[0],
        result: values[1],
        hasObservedValue: values[2],
        observedValue: values[3],
        source: values[4],
        observedAt: values[5],
        verifierVersion: values[6],
        supersedes: values[7],
    };
}

export async function readSettlementHeads(schema: Hex, decisionUID: Hex) {
    const address = await resolverFor(schema);
    const [activeHead, lastHead, revokeCount] = await Promise.all([
        withRetry(() => publicClient.readContract({address, abi: SETTLEMENT_RESOLVER_ABI, functionName: "activeHead", args: [decisionUID]})),
        withRetry(() => publicClient.readContract({address, abi: SETTLEMENT_RESOLVER_ABI, functionName: "lastHead", args: [decisionUID]})),
        withRetry(() => publicClient.readContract({address, abi: SETTLEMENT_RESOLVER_ABI, functionName: "revokeCount", args: [decisionUID]})),
    ]);
    return {activeHead, lastHead, revokeCount: Number(revokeCount)};
}

export async function readSettlementState(schema: Hex, decisionUID: Hex) {
    const heads = await readSettlementHeads(schema, decisionUID);
    const active = /^0x0{64}$/.test(heads.activeHead)
        ? undefined
        : await readSettlement(heads.activeHead);
    return {...heads, active, activeHeadTime: active?.time};
}

export async function readMetricDecimals(decisionSchema: Hex, metricId: Hex): Promise<number> {
    const address = await resolverFor(decisionSchema);
    const metric = await withRetry(() => publicClient.readContract({
        address,
        abi: DECISION_RESOLVER_ABI,
        functionName: "metrics",
        args: [metricId],
    }));
    return Number(metric[1]);
}

export async function readMetricDefinition(decisionSchema: Hex, metricId: Hex): Promise<{
    decimals: number;
    definitionHash: Hex;
}> {
    const address = await resolverFor(decisionSchema);
    const metric = await withRetry(() => publicClient.readContract({
        address,
        abi: DECISION_RESOLVER_ABI,
        functionName: "metrics",
        args: [metricId],
    }));
    return {decimals: Number(metric[1]), definitionHash: metric[3]};
}

export async function readChallengeLogs(challengeSchema: Hex): Promise<ChallengeLog[]> {
    const logs = await withRetry(() => publicClient.getLogs({
        address: EAS_ADDRESS,
        event: ATTESTED_EVENT,
        args: {schema: challengeSchema},
        fromBlock: 0n,
        toBlock: "latest",
    }));
    return Promise.all(logs.map(async (log) => {
        const uid = log.args.uid!;
        const attestation = await getAttestation(uid);
        const values = decodeAbiParameters(CHALLENGE_PARAMETERS, attestation.data);
        return {
            uid,
            attester: log.args.attester!,
            refUID: attestation.refUID,
            revocationTime: attestation.revocationTime,
            claimedResult: Number(values[1]),
            source: values[4],
        };
    }));
}

export async function readDecisionLogs(decisionSchema: Hex, attester: Address) {
    const logs = await withRetry(() => publicClient.getLogs({
        address: EAS_ADDRESS,
        event: ATTESTED_EVENT,
        args: {attester, schema: decisionSchema},
        fromBlock: 0n,
        toBlock: "latest",
    }));
    return Promise.all(logs.map((log) => readDecision(log.args.uid!)));
}

export async function readVerified(address: Address): Promise<boolean | "unknown"> {
    try {
        return await withRetry(() => publicClient.readContract({
            address: DOJANG_ADDRESS,
            abi: DOJANG_ABI,
            functionName: "isVerified",
            args: [address, UPBIT_KOREA_ID],
        }));
    } catch {
        return "unknown";
    }
}
