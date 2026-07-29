import type {EIP1193Provider} from "viem";

/**
 * EIP-6963 — 주입 지갑 탐지.
 *
 * 지갑을 둘 이상 설치하면 `window.ethereum` 은 한쪽이 가로챈다.
 * Phantom + MetaMask 조합에서 실제로 겪은 일이다 — `eth_accounts` 를 부르는 순간
 * Phantom 이 "어떤 확장 프로그램을 연결하시겠습니까?" 창을 띄워 페이지가 멈췄고,
 * 앱은 세션 복원에 실패한 것처럼 보였다.
 *
 * EIP-6963 은 각 지갑이 자기를 announce 하게 해서 이 충돌을 없앤다.
 * 심사자도 지갑을 여러 개 쓸 수 있으므로 필수다.
 */
export interface WalletOption {
    rdns: string;
    name: string;
    icon: string;
    provider: EIP1193Provider;
}

interface AnnounceEvent extends Event {
    detail: {
        info: {uuid: string; name: string; icon: string; rdns: string};
        provider: EIP1193Provider;
    };
}

const KEY = "poi.wallet.rdns";
const found = new Map<string, WalletOption>();
let listening = false;

function listen(): void {
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener("eip6963:announceProvider", (event) => {
        const {info, provider} = (event as AnnounceEvent).detail;
        found.set(info.rdns, {rdns: info.rdns, name: info.name, icon: info.icon, provider});
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** announce 는 비동기라 한 틱 기다린다. 그 뒤에도 비면 EIP-6963 미지원 지갑뿐이다. */
export async function discoverWallets(): Promise<WalletOption[]> {
    listen();
    await new Promise((resolve) => setTimeout(resolve, 120));
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function rememberWallet(rdns: string): void {
    try {
        localStorage.setItem(KEY, rdns);
    } catch {
        // 저장하지 못해도 이번 세션은 정상이다.
    }
}

export function forgetWallet(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // 무시
    }
}

function storedRdns(): string | null {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

/**
 * 쓸 provider 를 고른다.
 *
 * 1. 전에 고른 지갑이 있으면 그것
 * 2. EIP-6963 으로 하나만 발견되면 그것
 * 3. 둘 이상이면 **고르지 않는다** — 호출자가 사용자에게 물어야 한다
 * 4. 아무것도 없으면 `window.ethereum` 으로 떨어진다 (구형 지갑)
 */
export async function resolveProvider(): Promise<
    {kind: "ready"; option: WalletOption}
    | {kind: "choose"; options: WalletOption[]}
    | {kind: "legacy"; provider: EIP1193Provider}
    | {kind: "none"}
> {
    const options = await discoverWallets();
    const remembered = storedRdns();
    if (remembered) {
        const match = options.find((option) => option.rdns === remembered);
        if (match) return {kind: "ready", option: match};
    }
    if (options.length === 1) return {kind: "ready", option: options[0]!};
    if (options.length > 1) return {kind: "choose", options};
    if (window.ethereum) return {kind: "legacy", provider: window.ethereum};
    return {kind: "none"};
}
