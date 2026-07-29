export const CHAIN = {
    id: 91342,
    name: "GIWA Sepolia",
    rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://sepolia-rpc.giwa.io/",
    explorer: "https://sepolia-explorer.giwa.io",
};

export const EAS_ADDRESS =
    import.meta.env.VITE_EAS_ADDRESS ?? "0x4200000000000000000000000000000000000021";
export const EXPLORER_URL =
    import.meta.env.VITE_EXPLORER_URL ?? "https://sepolia-explorer.giwa.io";
export const SCHEMA_REGISTRY_ADDRESS =
    import.meta.env.VITE_SCHEMA_REGISTRY_ADDRESS ?? "0x4200000000000000000000000000000000000020";
export const DOJANG_ADDRESS =
    import.meta.env.VITE_DOJANG_ADDRESS ?? "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
/** 도장 Verified Address 발급자(업비트 코리아). 컨트랙트의 verifiedIssuer 와 같아야 한다. */
export const DOJANG_ISSUER =
    import.meta.env.VITE_DOJANG_ISSUER ?? "0x09B170CA2A006081042992bCE7379B85a02149C6";

export const UPBIT_KOREA_ID =
    "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034";

/** 배포 후 채운다. 하나라도 비어 있으면 발행 UI를 막고 안내를 띄운다. */
export const SCHEMAS = {
    note: import.meta.env.VITE_NOTE_SCHEMA_UID ?? "",
    decision: import.meta.env.VITE_DECISION_SCHEMA_UID ?? "",
    settlement: import.meta.env.VITE_SETTLEMENT_SCHEMA_UID ?? "",
    challenge: import.meta.env.VITE_CHALLENGE_SCHEMA_UID ?? "",
};

export const RESOLVERS = {
    note: import.meta.env.VITE_NOTE_RESOLVER ?? "",
    decision: import.meta.env.VITE_DECISION_RESOLVER ?? "",
    settlement: import.meta.env.VITE_SETTLEMENT_RESOLVER ?? "",
    challenge: import.meta.env.VITE_CHALLENGE_RESOLVER ?? "",
};

export const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_DEPLOY_BLOCK ?? "0");

export const DOJANG_SCHEMA_UID = import.meta.env.VITE_DOJANG_SCHEMA_UID ?? "";

export function isLocalChain(): boolean {
    return /(?:127\.0\.0\.1|localhost)/i.test(CHAIN.rpcUrl);
}

export function isDeployed(): boolean {
    return Object.values(SCHEMAS).every((uid) => /^0x[0-9a-fA-F]{64}$/.test(uid))
        && Object.values(RESOLVERS).every((address) => /^0x[0-9a-fA-F]{40}$/.test(address));
}
