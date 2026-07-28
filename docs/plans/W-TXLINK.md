# W-TXLINK 발행 결과에 tx 해시와 익스플로러 링크

## 왜

`SUBMISSION.md` §4: 심사자가 "직접 만들어 보라"고 하면 UI에서 발행한 것을
**익스플로러에서 따라갈 수 있어야** 한다. 지금 발행 후 화면에 남는 것은 UID뿐이고
tx 해시가 없다. 온체인에 실제로 올라갔다는 증거가 화면에 없다.

## 파일

- 새로: `web/src/receipt.tsx` — 발행 결과 표시 컴포넌트 + 링크 생성 순수 함수
- 수정: `web/src/eas.ts` — `attest`/`revoke`가 UID뿐 아니라 **tx 해시도** 돌려준다
- 수정: `web/src/note.tsx` · `decision.tsx` · `settlement.tsx` · `challenge.tsx` — 결과 표시
- 수정: `web/src/config.ts` — 익스플로러 URL을 환경변수로
- 새로: `web/test/receipt.test.ts`
- **그 외 수정 금지.** `core/`·`contracts/`·`verifier/`·`scripts/` 손대지 않는다.

## 1. `config.ts`

```ts
export const EXPLORER_URL =
    import.meta.env.VITE_EXPLORER_URL ?? "https://sepolia-explorer.giwa.io";
```

로컬 시드에서는 익스플로러가 없다. `dev_up.sh`가 `.env.local`에 쓰지 않으므로
기본값이 남는데, **로컬 체인에서는 그 링크가 동작하지 않는다.**
그래서 `config.ts`에 `isLocalChain()`을 두고(`CHAIN.rpcUrl`이 `127.0.0.1`/`localhost`면 true),
로컬이면 링크를 만들지 않고 **해시만 복사 가능한 텍스트로** 보여준다.
없는 링크를 만들어 주는 것이 없는 것보다 나쁘다.

## 2. `eas.ts`

지금 `attest`는 UID만 돌려준다. 바꾼다.

```ts
export interface AttestResult { uid: Hex; txHash: Hex; }
export async function attest(args): Promise<AttestResult>;
export async function revoke(args): Promise<{txHash: Hex}>;
```

`writeContract`가 주는 tx 해시를 그대로 담고, `waitForTransactionReceipt`의
영수증에서 UID를 뽑는다. **로직을 바꾸지 말 것** — 반환값에 해시를 추가하는 것뿐이다.

## 3. `receipt.tsx`

```ts
export function txUrl(txHash: Hex): string | undefined;      // 로컬이면 undefined
export function attestationUrl(uid: Hex): string | undefined;

export function Receipt(props: {label: string; uid?: Hex; txHash?: Hex}): JSX.Element | null;
```

표시는 `.doc-fields` 정의 목록으로:

```
발행     결정 커밋
UID      0x…                 (mono, 링크 있으면 익스플로러로)
트랜잭션  0x…                 (mono, 링크 있으면 익스플로러로)
```

- `uid`·`txHash` 둘 다 없으면 아무것도 그리지 않는다(`null`).
- 링크는 `target="_blank" rel="noopener noreferrer"`.
- 로컬 체인이면 링크 대신 `.doc-note`로
  `"로컬 체인이라 익스플로러 링크가 없습니다."` 한 줄.
- 발행 성공 직후 이 블록에 **인장이 찍히는 동작**(`.seal--stamping`)을 붙이지 말 것 —
  인장은 상태 표시(W7)의 것이다. 여기서는 조용히 나타난다.

익스플로러 경로는 GIWA(Blockscout 계열) 기준:

```
tx           {EXPLORER_URL}/tx/{txHash}
attestation  {EXPLORER_URL}/address/{EAS_ADDRESS}    ← EAS는 attestation 전용 페이지가 없다
```

> attestation UID를 익스플로러가 직접 보여주지 않으므로 **UID는 링크하지 않는다.**
> tx만 링크한다. 없는 페이지로 보내는 것보다 낫다.

## 4. 각 발행 화면

`note.tsx` · `decision.tsx` · `settlement.tsx` · `challenge.tsx`에서
발행 성공 시 `<Receipt .../>`를 렌더한다. 철회 버튼도 tx 해시를 보여준다.

기존의 성공 문구가 있으면 그것과 중복되지 않게 정리한다 —
`SUBMISSION.md`가 말하는 "심사자가 따라갈 수 있는 증거"가 목적이다.

## 5. 테스트 — `web/test/receipt.test.ts`

| # | 내용 |
|---|---|
| 1 | 공개 체인 RPC → `txUrl`이 `{EXPLORER_URL}/tx/{hash}` |
| 2 | `127.0.0.1` RPC → `txUrl`이 `undefined` |
| 3 | `localhost` RPC → `undefined` |
| 4 | `attestationUrl`은 항상 `undefined` (UID 전용 페이지가 없다) |
| 5 | `EXPLORER_URL` 끝에 `/`가 있어도 `//tx/`가 되지 않는다 |

`import.meta.env`를 테스트에서 바꿔야 하므로 순수 함수는 **URL과 rpcUrl을 인자로 받는**
형태로 분리한다: `buildTxUrl(explorerUrl: string, rpcUrl: string, hash: string)`.
컴포넌트가 `config`에서 읽어 그것에 넘긴다. 그래야 테스트가 환경변수에 의존하지 않는다.

## 하지 말 것

- 발행 로직을 바꾸지 말 것. 반환값에 해시를 더하는 것뿐이다.
- 익스플로러 API를 호출하지 말 것. 링크만 만든다.
- 로컬 체인에서 동작하지 않는 링크를 만들지 말 것.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
cd web && npx tsc --noEmit
cd web && npm test          # 45 + 5
cd web && npm run build
```
