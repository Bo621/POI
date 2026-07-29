import {
    createPublicClient,
    createWalletClient,
    custom,
    defineChain,
    http,
    type EIP1193Provider,
} from "viem";
import {CHAIN} from "./config";

const giwaSepolia = defineChain({
    id: CHAIN.id,
    name: CHAIN.name,
    nativeCurrency: {name: "ETH", symbol: "ETH", decimals: 18},
    rpcUrls: {default: {http: [CHAIN.rpcUrl]}},
    blockExplorers: {default: {name: "GIWA Explorer", url: CHAIN.explorer}},
});

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
            }
        }
    }
    throw lastError;
}

export const publicClient = createPublicClient({
    chain: giwaSepolia,
    transport: http(CHAIN.rpcUrl),
});

declare global {
    interface Window {
        ethereum?: EIP1193Provider;
    }
}

let selected: EIP1193Provider | undefined;

/** EIP-6963 으로 고른 provider 를 지정한다. 지갑이 여럿일 때 window.ethereum 은 신뢰할 수 없다. */
export function setProvider(provider: EIP1193Provider): void {
    selected = provider;
}

export function getProvider(): EIP1193Provider | undefined {
    return selected ?? window.ethereum;
}

export function getWalletClient() {
    const provider = getProvider();
    if (!provider) {
        throw new Error("브라우저 지갑을 찾을 수 없습니다. 지갑 확장 프로그램을 설치해 주세요.");
    }
    return createWalletClient({chain: giwaSepolia, transport: custom(provider)});
}
