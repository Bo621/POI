// TODO(사람): Dojang 검증 스키마 UID를 확인해 VITE_DOJANG_SCHEMA_UID에 설정해야
// 검증 attestation의 최신 UID를 결정에 기록할 수 있다.
import {useCallback, useEffect, useState} from "react";
import {
    parseAbi,
    parseAbiItem,
    type Address,
    type Hex,
} from "viem";
import {publicClient, getProvider, getWalletClient, setProvider, withRetry} from "./chain";
import {forgetWallet, rememberWallet, resolveProvider, type WalletOption} from "./provider";
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
    const [choices, setChoices] = useState<WalletOption[]>();

    /** 주소가 정해진 뒤의 검증 스냅샷 조회. 연결·복원·계정 변경이 모두 이 경로를 탄다. */
    const load = useCallback(async (address: Address) => {
        // **주소를 먼저 반영한다.** 도장 조회(isVerified + getLogs 9만 블록)를 기다리면
        // 새로고침 직후 몇 초 동안 화면이 '연결 안 됨' 으로 보이고, 그 사이 사용자가
        // '연결' 을 눌러 불필요한 지갑 프롬프트가 뜬다. 실제로 그렇게 겪었다.
        onChange({address, verified: "unknown", verifiedAddressUID: ZERO_UID});

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

    async function connectWith(option?: WalletOption) {
        setConnecting(true);
        setError("");
        try {
            if (option) {
                setProvider(option.provider);
                rememberWallet(option.rdns);
                setChoices(undefined);
            }
            const [address] = await getWalletClient().requestAddresses();
            if (address) await load(address);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "지갑 연결에 실패했습니다.");
        } finally {
            setConnecting(false);
        }
    }

    /** 지갑을 고르게 한다. 하나뿐이면 바로 연결한다. */
    async function connect() {
        setError("");
        const resolved = await resolveProvider();
        if (resolved.kind === "none") {
            setError("브라우저 지갑을 찾을 수 없습니다. 지갑 확장 프로그램을 설치해 주세요.");
            return;
        }
        if (resolved.kind === "choose") {
            setChoices(resolved.options);
            return;
        }
        if (resolved.kind === "ready") await connectWith(resolved.option);
        else await connectWith();
    }

    /** 앱 상태만 지운다. 지갑의 사이트 승인은 지갑에서 취소해야 한다. */
    function disconnect() {
        setError("");
        forgetWallet();
        onChange({verified: false, verifiedAddressUID: ZERO_UID});
    }

    // 새로고침하면 연결이 풀려 매번 다시 눌러야 했다.
    // eth_accounts 는 프롬프트 없이 이미 승인된 계정을 돌려준다 — 그걸로 복원한다.
    useEffect(() => {
        let active = true;
        let provider: ReturnType<typeof getProvider>;

        // 지갑에서 계정을 바꿨는데 앱이 모르면, 화면은 A 를 보여주고 서명은 B 가 한다.
        const onAccounts = (accounts: unknown) => {
            const [address] = accounts as Address[];
            if (!address) disconnect();
            else void load(address);
        };
        const onChain = () => window.location.reload();

        // 지갑이 여럿이면 `window.ethereum` 은 한쪽이 가로챈다.
        // 전에 고른 지갑이 있을 때만 조용히 복원한다 — 고르지 않았으면 묻지 않는다.
        void (async () => {
            const resolved = await resolveProvider();
            if (!active) return;
            if (resolved.kind === "ready") setProvider(resolved.option.provider);
            else if (resolved.kind === "legacy") setProvider(resolved.provider);
            else return;   // choose / none — 사용자가 '연결' 을 누를 때 정한다

            provider = getProvider();
            if (!provider) return;
            try {
                const accounts = await provider.request({method: "eth_accounts"}) as Address[];
                if (active && accounts[0] && !state.address) await load(accounts[0]);
            } catch {
                // 복원 실패는 조용히 넘긴다 — 사용자가 직접 연결하면 된다
            }
            if (!active) return;
            provider.on?.("accountsChanged", onAccounts);
            provider.on?.("chainChanged", onChain);
        })();

        return () => {
            active = false;
            provider?.removeListener?.("accountsChanged", onAccounts);
            provider?.removeListener?.("chainChanged", onChain);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    // '미검증' 만 쓰면 결함처럼 읽힌다. 실제로는 도장(Dojang) Verified Address 가
    // 없다는 사실 서술이고, POI 사용에는 아무 제약이 없다.
    const badge = state.verified === true
        ? "도장 검증 지갑"
        : state.verified === false
            ? "일반 지갑"
            : "도장 조회 실패";
    const badgeTitle = state.verified === true
        ? "도장(Dojang) Verified Address 를 가진 지갑입니다."
        : state.verified === false
            ? "도장 Verified Address 가 없는 지갑입니다. 기록·정산·이의 모두 그대로 쓸 수 있고, '커밋 시점에 검증 지갑이었다'는 명제 하나만 빠집니다."
            : "도장 컨트랙트 조회에 실패했습니다. 검증 여부를 알 수 없습니다.";

    return (
        <div className="site-nav__wallet">
            {state.address
                ? <span className={`wallet-badge wallet-badge--${state.verified === true ? "verified" : state.verified === false ? "unverified" : "unknown"}`}>
                    <a className="hex" href={`#/passport/${state.address.toLowerCase()}`}>{shortAddress(state.address)}</a> <span title={badgeTitle}>{badge}</span>
                </span>
                : <span className="site-nav__wallet-empty">지갑 연결 안 됨</span>}
            {state.address
                ? <button className="btn-quiet" type="button" onClick={disconnect}>연결 해제</button>
                : <button className="btn" type="button" onClick={connect} disabled={connecting}>
                    {connecting ? "연결 중…" : "연결"}
                </button>}
            {choices && <div className="wallet-choices" role="group" aria-label="지갑 선택">
                <p className="notice--quiet">설치된 지갑이 여럿입니다. 쓸 지갑을 고르세요.</p>
                {choices.map((option) => (
                    <button
                        key={option.rdns}
                        className="btn-quiet wallet-choice"
                        type="button"
                        onClick={() => void connectWith(option)}
                        disabled={connecting}
                    >
                        <img src={option.icon} alt="" width={18} height={18} />
                        {option.name}
                    </button>
                ))}
                <button className="btn-quiet" type="button" onClick={() => setChoices(undefined)}>취소</button>
            </div>}
            {error && <p className="form-status" role="alert">{error}</p>}
        </div>
    );
}

export {ZERO_UID};
