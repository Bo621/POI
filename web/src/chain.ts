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

export function getWalletClient() {
    if (!window.ethereum) {
        throw new Error("브라우저 지갑을 찾을 수 없습니다. 지갑 확장 프로그램을 설치해 주세요.");
    }
    return createWalletClient({chain: giwaSepolia, transport: custom(window.ethereum)});
}
