/**
 * 정산의 verifierVersion 필드에 그대로 들어가는 문자열이다.
 * 판정 로직이 바뀌면 이 값을 올린다 — 과거 정산이 어떤 규칙으로 계산됐는지 남기기 위해서다.
 */
export const VERIFIER_VERSION = "poi-verifier/1.0.0" as const;
