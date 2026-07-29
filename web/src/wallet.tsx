// TODO(사람): Dojang 검증 스키마 UID를 확인해 VITE_DOJANG_SCHEMA_UID에 설정해야
// 검증 attestation의 최신 UID를 결정에 기록할 수 있다.
import {useCallback, useEffect, useState} from "react";
import {
    parseAbi,
    parseAbiItem,
    type Address,
    type Hex,
} from "viem";
import {publicClient, getWalletClient, withRetry} from "./chain";
import {
    DEPLOY_BLOCK,
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
    // 공개 RPC 는 getLogs 구간을 100,000 블록으로 제한한다. fromBlock: 0n 은 실패한다.
    const latest = await withRetry(() => publicClient.getBlockNumber());
    const from = DEPLOY_BLOCK > 0n && latest - DEPLOY_BLOCK < 90_000n ? DEPLOY_BLOCK : latest - 90_000n;
    const logs = await withRetry(() => publicClient.getLogs({
        address: EAS_ADDRESS,
        event: ATTESTED_EVENT,
        args: {recipient: address, schema: DOJANG_SCHEMA_UID as Hex},
        fromBlock: from > 0n ? from : 0n,
        toBlock: latest,
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

    /** 주소가 정해진 뒤의 검증 스냅샷 조회. 연결·복원·계정 변경이 모두 이 경로를 탄다. */
    const load = useCallback(async (address: Address) => {
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
            // UID 조회 실패는 발행을 막지 않는다. 안내는 기록하기의 발행 절에 표시한다.
        }
        onChange({address, verified, verifiedAddressUID});
    }, [onChange]);

    async function connect() {
        setConnecting(true);
        setError("");
        try {
            const [address] = await getWalletClient().requestAddresses();
            if (address) await load(address);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "지갑 연결에 실패했습니다.");
        } finally {
            setConnecting(false);
        }
    }

    /** 앱 상태만 지운다. 지갑의 사이트 승인은 지갑에서 취소해야 한다. */
    function disconnect() {
        setError("");
        onChange({verified: false, verifiedAddressUID: ZERO_UID});
    }

    // 새로고침하면 연결이 풀려 매번 다시 눌러야 했다.
    // eth_accounts 는 프롬프트 없이 이미 승인된 계정을 돌려준다 — 그걸로 복원한다.
    useEffect(() => {
        const provider = window.ethereum;
        if (!provider) return;
        let active = true;

        void provider.request({method: "eth_accounts"})
            .then((accounts) => {
                const [address] = accounts as Address[];
                if (active && address && !state.address) void load(address);
            })
            .catch(() => {/* 복원 실패는 조용히 넘긴다 — 사용자가 직접 연결하면 된다 */});

        // 지갑에서 계정을 바꿨는데 앱이 모르면, 화면은 A 를 보여주고 서명은 B 가 한다.
        const onAccounts = (accounts: unknown) => {
            const [address] = accounts as Address[];
            if (!address) disconnect();
            else void load(address);
        };
        const onChain = () => window.location.reload();
        provider.on?.("accountsChanged", onAccounts);
        provider.on?.("chainChanged", onChain);
        return () => {
            active = false;
            provider.removeListener?.("accountsChanged", onAccounts);
            provider.removeListener?.("chainChanged", onChain);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const badge = state.verified === true
        ? "검증 지갑"
        : state.verified === false
            ? "미검증 지갑 (사용 가능)"
            : "확인 불가";

    return (
        <div className="site-nav__wallet">
            {state.address
                ? <span className={`wallet-badge wallet-badge--${state.verified === true ? "verified" : state.verified === false ? "unverified" : "unknown"}`}>
                    <a className="hex" href={`#/passport/${state.address.toLowerCase()}`}>{shortAddress(state.address)}</a> {badge}
                </span>
                : <span className="site-nav__wallet-empty">지갑 연결 안 됨</span>}
            {state.address
                ? <button className="btn-quiet" type="button" onClick={disconnect}>연결 해제</button>
                : <button className="btn" type="button" onClick={connect} disabled={connecting}>
                    {connecting ? "연결 중…" : "연결"}
                </button>}
            {error && <p className="form-status" role="alert">{error}</p>}
        </div>
    );
}

export {ZERO_UID};
