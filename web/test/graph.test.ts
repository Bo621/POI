import {describe, expect, it} from "vitest";
import type {Hex} from "viem";
import {buildDag} from "../src/graph";

const uid = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const address = "0x1111111111111111111111111111111111111111" as Hex;

function fetcher(entries: Record<string, Hex[] | undefined>) {
    return async (key: Hex) => entries[key] === undefined
        ? undefined
        : {attester: address, time: 1n, parents: entries[key]!};
}

describe("buildDag", () => {
    it("returns one root without parents", async () => {
        const result = await buildDag(uid("1"), fetcher({[uid("1")]: []}));
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].depth).toBe(0);
    });

    it("walks a three-node chain by depth", async () => {
        const result = await buildDag(uid("1"), fetcher({
            [uid("1")]: [uid("2")], [uid("2")]: [uid("3")], [uid("3")]: [],
        }));
        expect(result.nodes.map((node) => node.depth)).toEqual([0, 1, 2]);
    });

    it("visits a shared grandparent once", async () => {
        const result = await buildDag(uid("1"), fetcher({
            [uid("1")]: [uid("2"), uid("3")],
            [uid("2")]: [uid("4")],
            [uid("3")]: [uid("4")],
            [uid("4")]: [],
        }));
        expect(result.nodes.filter((node) => node.uid === uid("4"))).toHaveLength(1);
    });

    it("stops on a cycle", async () => {
        const result = await buildDag(uid("1"), fetcher({
            [uid("1")]: [uid("2")], [uid("2")]: [uid("1")],
        }));
        expect(result.nodes).toHaveLength(2);
    });

    it("does not follow grandchildren past maxDepth", async () => {
        const result = await buildDag(uid("1"), fetcher({
            [uid("1")]: [uid("2")], [uid("2")]: [uid("3")], [uid("3")]: [],
        }), {maxDepth: 1});
        expect(result.nodes.map((node) => node.uid)).toEqual([uid("1"), uid("2")]);
    });

    it("reports maxNodes truncation", async () => {
        const result = await buildDag(uid("1"), fetcher({
            [uid("1")]: [uid("2"), uid("3")], [uid("2")]: [], [uid("3")]: [],
        }), {maxNodes: 2});
        expect(result.nodes).toHaveLength(2);
        expect(result.truncated).toBe(true);
    });

    it("retains a missing parent", async () => {
        const result = await buildDag(uid("1"), fetcher({[uid("1")]: [uid("2")]}));
        expect(result.nodes[1]).toMatchObject({uid: uid("2"), missing: true});
    });
});
