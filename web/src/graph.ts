import type {Hex} from "viem";

export interface DagNode {
    uid: Hex;
    attester: Hex;
    time: bigint;
    depth: number;
    parents: Hex[];
    missing: boolean;
}

export interface DagResult {
    nodes: DagNode[];
    truncated: boolean;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Hex;

/** 부모 방향 너비 우선 조회. */
export async function buildDag(
    root: Hex,
    fetchParents: (uid: Hex) => Promise<{attester: Hex; time: bigint; parents: Hex[]} | undefined>,
    opts: {maxDepth?: number; maxNodes?: number} = {},
): Promise<DagResult> {
    const maxDepth = opts.maxDepth ?? 3;
    const maxNodes = opts.maxNodes ?? 64;
    if (maxNodes <= 0) return {nodes: [], truncated: true};

    const queue = [{uid: root, depth: 0}];
    const visited = new Set<Hex>([root]);
    const nodes: DagNode[] = [];
    let truncated = false;

    while (queue.length > 0) {
        if (nodes.length >= maxNodes) {
            truncated = true;
            break;
        }
        const current = queue.shift()!;
        let record: Awaited<ReturnType<typeof fetchParents>>;
        try {
            record = await fetchParents(current.uid);
        } catch {
            record = undefined;
        }
        if (!record) {
            nodes.push({
                uid: current.uid,
                attester: ZERO_ADDRESS,
                time: 0n,
                depth: current.depth,
                parents: [],
                missing: true,
            });
            continue;
        }

        nodes.push({...record, uid: current.uid, depth: current.depth, missing: false});
        if (current.depth >= maxDepth) continue;
        for (const parent of record.parents) {
            if (visited.has(parent)) continue;
            visited.add(parent);
            queue.push({uid: parent, depth: current.depth + 1});
        }
    }

    return {nodes, truncated};
}
