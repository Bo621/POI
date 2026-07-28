// TODO(사람): Dojang 검증 스키마 UID를 확인해 VITE_DOJANG_SCHEMA_UID에 설정해야
// 검증 attestation의 최신 UID를 결정에 기록할 수 있다.
import {useState} from "react";
import {
    parseAbi,
    parseAbiItem,
    type Address,
    type Hex,
} from "viem";
import {publicClient, getWalletClient, withRetry} from "./chain";
import {
    DOJANG_ADDRESS,
    DOJANG_SCHEMA_UID,
    EAS_ADDRESS,
    UPBIT_KOREA_ID,
} from "./config";

const ZERO_UID = `0x${"00".repeat(32)}` as Hex;
const DOJANG_ABI = parseAbi([
    "function isVerified(address account, bytes32 identity) view returns (bool)",
]);
const ATTESTED_EVENT = parseAbiItem(
    "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)",
);

export interface VerificationSnapshot {
    verified: boolean | "unknown";
    verifiedAddressUID: Hex;
}

export interface WalletState extends VerificationSnapshot {
    address?: Address;
}

async function findLatestVerificationUID(address: Address): Promise<Hex> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(DOJANG_SCHEMA_UID)) return ZERO_UID;
    const logs = await withRetry(() => publicClient.getLogs({
        address: EAS_ADDRESS,
        event: ATTESTED_EVENT,
        args: {recipient: address, schema: DOJANG_SCHEMA_UID as Hex},
        fromBlock: 0n,
        toBlock: "latest",
    }));
    return logs.at(-1)?.args.uid ?? ZERO_UID;
}

export function shortAddress(address: Address): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Wallet({state, onChange}: {
    state: WalletState;
    onChange: (state: WalletState) => void;
}) {
    const [error, setError] = useState("");
    const [connecting, setConnecting] = useState(false);

    async function connect() {
        setConnecting(true);
        setError("");
        try {
            const wallet = getWalletClient();
            const [address] = await wallet.requestAddresses();
            let verified: boolean | "unknown";
            try {
                verified = await withRetry(() => publicClient.readContract({
                    address: DOJANG_ADDRESS,
                    abi: DOJANG_ABI,
                    functionName: "isVerified",
                    args: [address, UPBIT_KOREA_ID],
                }));
            } catch {
                verified = "unknown";
            }

            let verifiedAddressUID = ZERO_UID;
            try {
                verifiedAddressUID = await findLatestVerificationUID(address);
            } catch {
                // UID 조회 실패는 발행을 막지 않는다. 0으로 기록된다는 안내는 아래에 상시 표시한다.
            }
            const next = {address, verified, verifiedAddressUID};
            onChange(next);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "지갑 연결에 실패했습니다.");
        } finally {
            setConnecting(false);
        }
    }

    const badge = state.verified === true
        ? "검증 지갑"
        : state.verified === false
            ? "미검증 지갑 (사용 가능)"
            : "확인 불가";

    return (
        <div className="site-nav__wallet">
            {state.address
                ? <span className={`wallet-badge wallet-badge--${state.verified === true ? "verified" : state.verified === false ? "unverified" : "unknown"}`}>
                    <span className="hex">{shortAddress(state.address)}</span> {badge}
                </span>
                : <span className="site-nav__wallet-empty">지갑 연결 안 됨</span>}
            <button className="btn" type="button" onClick={connect} disabled={connecting}>
                {connecting ? "연결 중…" : "연결"}
            </button>
            {state.address && state.verifiedAddressUID === ZERO_UID && (
                <p className="notice notice--quiet">검증 지갑 스냅샷 UID를 찾지 못했습니다 (0으로 기록됩니다)</p>
            )}
            {error && <p className="form-status" role="alert">{error}</p>}
        </div>
    );
}

export {ZERO_UID};
