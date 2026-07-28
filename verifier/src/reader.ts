import {
    createPublicClient,
    decodeAbiParameters,
    http,
    parseAbi,
    type Address,
    type Hex,
} from "viem";

export interface OnChainDecision {
    uid: Hex;
    attester: Hex;
    time: bigint;
    revocationTime: bigint;
    hasExpectedOutcome: boolean;
    outcomeMetricId: Hex;
    outcomeOp: number;
    outcomeThreshold: bigint;
    windowStart: bigint;
    windowEnd: bigint;
    graceSeconds: bigint;
    evidenceCommitment: Hex;
}

export interface OnChainSettlement {
    uid: Hex;
    attester: Hex;
    time: bigint;
    revocationTime: bigint;
    result: number;
    hasObservedValue: boolean;
    observedValue: bigint;
    source: string;
    observedAt: bigint;
    verifierVersion: string;
    supersedes: Hex;
}

export interface OnChainMetric {
    allowed: boolean;
    decimals: number;
    kind: number;
    definitionHash: Hex;
    frozen: boolean;
}

export interface ChainReader {
    getChainTime(): Promise<bigint>;
    getDecision(uid: Hex): Promise<OnChainDecision | undefined>;
    getActiveHead(decisionUID: Hex): Promise<Hex>;
    getRevokeCount(decisionUID: Hex): Promise<number>;
    getSettlement(uid: Hex): Promise<OnChainSettlement | undefined>;
    getMetric(metricId: Hex): Promise<OnChainMetric>;
}

export interface ViemReaderConfig {
    rpcUrl: string;
    easAddress: Address;
    settlementResolverAddress: Address;
    metricRegistryAddress: Address;
}

const EAS_ABI = parseAbi([
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))",
]);
const SETTLEMENT_RESOLVER_ABI = parseAbi([
    "function activeHead(bytes32 decisionUID) view returns (bytes32)",
    "function revokeCount(bytes32 decisionUID) view returns (uint32)",
]);
const METRIC_REGISTRY_ABI = parseAbi([
    "function metrics(bytes32 metricId) view returns (bool allowed, uint8 decimals, uint8 kind, bytes32 definitionHash, bool frozen)",
]);
const DECISION_PARAMETERS = [
    {type: "bytes32[]"},
    {type: "bytes32"},
    {type: "bytes32"},
    {type: "bytes32"},
    {type: "bytes32"},
    {type: "bytes32"},
    {type: "bytes32"},
    {type: "bool"},
    {type: "bytes32"},
    {type: "uint8"},
    {type: "int128"},
    {type: "uint64"},
    {type: "uint64"},
    {type: "uint32"},
] as const;
const SETTLEMENT_PARAMETERS = [
    {type: "bytes32"},
    {type: "uint8"},
    {type: "bool"},
    {type: "int128"},
    {type: "string"},
    {type: "uint64"},
    {type: "string"},
    {type: "bytes32"},
] as const;

/**
 * viem 기반의 얇은 체인 어댑터다.
 * 이 구현은 O 단계의 포크 리허설에서 검증한다.
 */
export function createViemReader(config: ViemReaderConfig): ChainReader {
    const publicClient = createPublicClient({transport: http(config.rpcUrl)});
    const getAttestation = (uid: Hex) => publicClient.readContract({
        address: config.easAddress,
        abi: EAS_ABI,
        functionName: "getAttestation",
        args: [uid],
    });

    return {
        async getChainTime() {
            const block = await publicClient.getBlock();
            return block.timestamp;
        },
        async getDecision(uid) {
            const attestation = await getAttestation(uid);
            if (/^0x0+$/i.test(attestation.uid)) return undefined;
            const decoded = decodeAbiParameters(DECISION_PARAMETERS, attestation.data);
            // viem은 uint32/uint64를 number로 주므로 인터페이스 경계에서 한 번만 변환한다.
            return {
                uid: attestation.uid,
                attester: attestation.attester,
                time: BigInt(attestation.time),
                revocationTime: BigInt(attestation.revocationTime),
                evidenceCommitment: decoded[5],
                hasExpectedOutcome: decoded[7],
                outcomeMetricId: decoded[8],
                outcomeOp: Number(decoded[9]),
                outcomeThreshold: BigInt(decoded[10]),
                windowStart: BigInt(decoded[11]),
                windowEnd: BigInt(decoded[12]),
                graceSeconds: BigInt(decoded[13]),
            };
        },
        async getActiveHead(decisionUID) {
            return publicClient.readContract({
                address: config.settlementResolverAddress,
                abi: SETTLEMENT_RESOLVER_ABI,
                functionName: "activeHead",
                args: [decisionUID],
            });
        },
        async getRevokeCount(decisionUID) {
            const count = await publicClient.readContract({
                address: config.settlementResolverAddress,
                abi: SETTLEMENT_RESOLVER_ABI,
                functionName: "revokeCount",
                args: [decisionUID],
            });
            return Number(count);
        },
        async getSettlement(uid) {
            const attestation = await getAttestation(uid);
            if (/^0x0+$/i.test(attestation.uid)) return undefined;
            const decoded = decodeAbiParameters(SETTLEMENT_PARAMETERS, attestation.data);
            // viem은 uint32/uint64를 number로 주므로 인터페이스 경계에서 한 번만 변환한다.
            return {
                uid: attestation.uid,
                attester: attestation.attester,
                time: BigInt(attestation.time),
                revocationTime: BigInt(attestation.revocationTime),
                result: Number(decoded[1]),
                hasObservedValue: decoded[2],
                observedValue: BigInt(decoded[3]),
                source: decoded[4],
                observedAt: BigInt(decoded[5]),
                verifierVersion: decoded[6],
                supersedes: decoded[7],
            };
        },
        async getMetric(metricId) {
            const metric = await publicClient.readContract({
                address: config.metricRegistryAddress,
                abi: METRIC_REGISTRY_ABI,
                functionName: "metrics",
                args: [metricId],
            });
            return {
                allowed: metric[0],
                decimals: metric[1],
                kind: metric[2],
                definitionHash: metric[3],
                frozen: metric[4],
            };
        },
    };
}
