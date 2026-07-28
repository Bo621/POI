import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import type {Locator, Page} from "@playwright/test";
import type {Address, Hex} from "viem";

interface Seed {
    accounts: {A: Address; B: Address; C: Address};
    fixtures: {
        f1: {decisionUID: Hex; settlementUID: Hex};
        f2: {decisionUID: Hex; revokedSettlementUID: Hex; activeSettlementUID: Hex};
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
} catch {
    seedUnavailable = "scripts/dev_up.sh 를 먼저 실행하세요.";
}

export const accounts = seed?.accounts as Seed["accounts"];

export const rpcUrl = "http://127.0.0.1:8545";

export function shortAddressRe(address: string): RegExp {
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const compact = `${escape(address.slice(0, 6))}…${escape(address.slice(-4))}`;
    const detailed = `${escape(address.slice(0, 10))}…${escape(address.slice(-6))}`;
    return new RegExp(`(?:${compact}|${detailed})`, "i");
}

export async function openDetails(area: Locator, summaryText: string): Promise<void> {
    const summary = area.locator("summary").filter({hasText: summaryText});
    const details = summary.locator("..");
    if (await details.getAttribute("open") === null) {
        await summary.click();
    }
}

export async function chainNow(): Promise<number> {
    const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBlockByNumber",
            params: ["latest", false],
        }),
    });
    const payload = await response.json() as {result: {timestamp: string}};
    return Number.parseInt(payload.result.timestamp, 16);
}

export async function advanceChain(rpc: string, seconds: number): Promise<void> {
    let requestId = 0;
    const call = async (method: string, params: unknown[]): Promise<void> => {
        const response = await fetch(rpc, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({jsonrpc: "2.0", id: ++requestId, method, params}),
        });
        const payload = await response.json() as {
            error?: {message: string};
        };
        if (payload.error) throw new Error(payload.error.message);
    };

    await call("evm_increaseTime", [seconds]);
    // Keep mining sequential with transactions: Anvil 1.7.1 can panic if they overlap.
    await call("evm_mine", []);
}

export async function injectWallet(
    page: Page,
    address: Address,
    rpc: string,
    options: {authorized?: boolean} = {},
): Promise<void> {
    await page.addInitScript(({account, rpcUrl, initiallyAuthorized}) => {
        let requestId = 0;
        let authorized = initiallyAuthorized;
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
                    if (method === "eth_accounts") return authorized ? [account] : [];
                    if (method === "eth_requestAccounts") {
                        authorized = true;
                        return [account];
                    }
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
    }, {account: address, rpcUrl: rpc, initiallyAuthorized: options.authorized ?? true});
}

export function requireSeed(): Seed {
    if (!seed) throw new Error(seedUnavailable);
    return seed;
}
