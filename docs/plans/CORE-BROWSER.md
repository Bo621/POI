# CORE-BROWSER `@poi/core`를 브라우저에서 동작하게

`core/src/commitment.ts`가 Node 전용 `Buffer`를 쓴다. 두 곳:

```
38:  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;                       // generateSalt
65:  const jcsHex = `0x${Buffer.from(canonicalize(payload), "utf8").toString("hex")}` as Hex;
```

브라우저 번들에는 `Buffer`가 없다. `core`는 **프론트와 verifier가 같은 구현을 쓰기 위해**
존재하는 패키지다(PLAN.md §1). 한쪽에서 안 도는 것은 그 전제를 깬다.
web에 shim을 넣어 덮는 방식은 문제를 감춘다 — 원인을 고친다.

## 파일

- 수정: `core/src/commitment.ts` — 위 두 줄만
- 수정: `core/test/commitment.test.ts` — 아래 테스트 하나 추가
- **그 외 파일 수정 금지.**

## 고치는 방법

`viem`이 이미 의존성이다. `Buffer` 대신 viem의 변환 함수를 쓴다.

- `Buffer.from(bytes).toString("hex")` → `bytesToHex(bytes)` (`0x` 접두어를 포함해 반환하므로
  기존의 `` `0x${...}` `` 템플릿을 제거할 것)
- `Buffer.from(canonicalize(payload), "utf8").toString("hex")` →
  `bytesToHex(new TextEncoder().encode(canonicalize(payload)))`

`import {bytesToHex} from "viem";`를 기존 viem import에 합친다.

**동작이 바뀌면 안 된다.** `core/vectors/commitment.v1.json` 6케이스가 그대로 통과해야 하고,
Solidity 테스트(`contracts/test/CommitmentVector.t.sol`)도 같은 값을 본다.

## 추가할 테스트 — `core/test/commitment.test.ts`

```
test: "브라우저 환경(Buffer 없음)에서도 동작한다"
```

- `globalThis.Buffer`를 임시로 `undefined`로 만든다 (원래 값을 저장해 두고 `finally`에서 복원).
- 그 상태에서 `generateSalt()`와 `commitment(...)`를 호출한다.
- 벡터 파일의 첫 케이스와 같은 값이 나오는지 확인한다.
- 복원한다.

이 테스트가 있으면 나중에 누군가 `Buffer`를 다시 넣어도 바로 깨진다.

## 검증

```
cd core && npm test          # 53 + 1 = 54
cd core && npx tsc --noEmit
cd verifier && npm test      # 14/14 회귀 없음
cd contracts && forge test   # 144/144 회귀 없음 (벡터가 같아야 한다)
```
