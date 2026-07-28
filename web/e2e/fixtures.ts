import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import type {Page} from "@playwright/test";
import type {Address, Hex} from "viem";

interface Seed {
    accounts: {A: Address; B: Address; C: Address};
    fixtures: {
        f1: {decisionUID: Hex; settlementUID: Hex};
        f2: {decisionUID: Hex};
        f4: {decisionUID: Hex};
        f5: {decisionUID: Hex};
        f_copy: {decisionUID: Hex; decisionCommitment: Hex};
    };
    challengeUID: Hex;
    f1Reveal: {salt: Hex; payload: unknown};
}

const seedPath = resolve(process.cwd(), "../docs/fixtures/seed.json");

export let seed: Seed | undefined;
export let seedUnavailable = "";

try {
    seed = JSON.parse(readFileSync(seedPath, "utf8")) as Seed;
} catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    seedUnavailable = `시드가 없어 E2E를 건너뜁니다. 먼저 bash scripts/dev_up.sh를 실행하세요. (${detail})`;
}

export const accounts = seed?.accounts as Seed["accounts"];

export const rpcUrl = "http://127.0.0.1:8545";

export async function injectWallet(page: Page, address: Address, rpc: string): Promise<void> {
    await page.addInitScript(({account, rpcUrl}) => {
        let requestId = 0;
        const forward = async (method: string, params: unknown[] = []) => {
            const response = await fetch(rpcUrl, {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method, params}),
            });
            const payload = await response.json() as {
                result?: unknown;
                error?: {code: number; message: string; data?: unknown};
            };
            if (payload.error) {
                const error = new Error(payload.error.message) as Error & {
                    code?: number;
                    data?: unknown;
                };
                error.code = payload.error.code;
                error.data = payload.error.data;
                throw error;
            }
            return payload.result;
        };

        Object.defineProperty(window, "ethereum", {
            configurable: true,
            value: {
                request: async ({method, params}: {method: string; params?: unknown[]}) => {
                    if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
                    if (method === "eth_chainId") return "0x164ce";
                    if (method === "eth_sendTransaction") {
                        const [transaction = {}] = params ?? [];
                        return forward(method, [{...(transaction as object), from: account}]);
                    }
                    return forward(method, params);
                },
                on: () => undefined,
                removeListener: () => undefined,
            },
        });
    }, {account: address, rpcUrl: rpc});
}

export function requireSeed(): Seed {
    if (!seed) throw new Error(seedUnavailable);
    return seed;
}
