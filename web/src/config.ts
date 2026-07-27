export const CHAIN = {
    id: 91342,
    name: "GIWA Sepolia",
    rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://sepolia-rpc.giwa.io/",
    explorer: "https://sepolia-explorer.giwa.io",
};

export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";
export const DOJANG_ADDRESS = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
export const UPBIT_KOREA_ID =
    "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034";

/** 배포 후 채운다. 하나라도 비어 있으면 발행 UI를 막고 안내를 띄운다. */
export const SCHEMAS = {
    note: import.meta.env.VITE_NOTE_SCHEMA_UID ?? "",
    decision: import.meta.env.VITE_DECISION_SCHEMA_UID ?? "",
    settlement: import.meta.env.VITE_SETTLEMENT_SCHEMA_UID ?? "",
    challenge: import.meta.env.VITE_CHALLENGE_SCHEMA_UID ?? "",
};

export const DOJANG_SCHEMA_UID = import.meta.env.VITE_DOJANG_SCHEMA_UID ?? "";

export function isDeployed(): boolean {
    return Object.values(SCHEMAS).every((uid) => /^0x[0-9a-fA-F]{64}$/.test(uid));
}
