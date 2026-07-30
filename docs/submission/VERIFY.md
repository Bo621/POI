# 직접 확인하기

**POI의 주장은 "우리를 믿어라"가 아닙니다. 아래는 전부 직접 확인할 수 있습니다.**

준비물은 `cast`(Foundry)와 Node 22+뿐입니다. 지갑도 가스도 필요 없습니다 — 전부 읽기입니다.

```bash
export RPC=https://sepolia-rpc.giwa.io/
export EAS=0x4200000000000000000000000000000000000021
export DECISION_RESOLVER=0x0f25917176a405bb9022e5b417e0d57348b30f89
```

정확한 UID는 [`../DEPLOYMENT.md`](../DEPLOYMENT.md)에 있습니다.

---

## 1. 컨트랙트가 실제로 GIWA에 있다

```bash
cast code $DECISION_RESOLVER --rpc-url $RPC | head -c 20
```

익스플로러에서 소스도 검증돼 있습니다 (`Pass - Verified`):
`https://sepolia-explorer.giwa.io/address/0x0f25917176a405bb9022e5b417e0d57348b30f89`

## 2. 지표 정의가 문서에 고정돼 있고 바꿀 수 없다

지표마다 **계산식·데이터 출처·간격·결측치 정책**을 적은 문서가 있고,
그 **문서 바이트의 해시**가 온체인에 박혀 있습니다.

```bash
# 온체인에 기록된 definitionHash
cast call $DECISION_RESOLVER \
  "metrics(bytes32)(bool,uint8,uint8,bytes32,bool)" \
  0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf --rpc-url $RPC

# 저장소의 정의 문서 해시
# 파일 **원본 바이트**의 해시다. `$(cat …)` 는 끝 개행을 지워 다른 값이 나온다.
cast keccak "0x$(xxd -p -c 999999 < docs/metrics/BTC_PRICE_KRW_AT_END.md | tr -d '\n')"
```

**두 값이 같습니다.** 그리고 마지막 필드가 `true` — `frozen`입니다.
등록 이후 정의를 바꿀 수 없습니다. **문서가 없는 지표는 컨트랙트가 등록을 거부합니다.**

> 이것이 "나중에 유리하게 기준을 바꾸는 것"을 막는 장치입니다.

## 3. 관측 구간을 과거로 설정할 수 없다

POI의 핵심 방어입니다. 결과를 본 뒤에 "그 구간을 보고 있었다"고 주장할 수 없습니다.

```solidity
if (d.windowStart < attestTime) revert WindowInPast();   // I4
```

**직접 시도해 보실 수 있습니다.** 과거 구간으로 커밋을 시도하면 트랜잭션이 되돌아갑니다.

> 개발 중 실제로 여기 걸렸습니다. 데모 fixture를 만들면서 `windowStart = now`로 두었더니
> 시뮬레이션 시각이 채굴 블록보다 일러 `WindowInPast()`가 났습니다.
> **우회하지 않고 새 구간을 열었습니다** — 이 불변식을 데모 편의로 뚫으면 제품이 사라집니다.

## 4. 정산 결과를 발행자가 정할 수 없다

발행자는 **관측값과 출처만** 제출합니다. 맞았는지 여부(`result`)는 컨트랙트가 다시 계산해
대조하고, 어긋나면 트랜잭션을 실패시킵니다.

```solidity
uint8 expect = _eval(d.outcomeOp, s.observedValue, d.outcomeThreshold) ? 0 : 1;
if (s.result != expect) revert ResultMismatch();   // I17
```

관측값과 모순되는 결과를 기록하는 것이 **불가능합니다.**

## 5. 누구나 같은 절차로 재현한다

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=$RPC
export POI_EAS_ADDRESS=$EAS
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
export POI_METRIC_REGISTRY_ADDRESS=$DECISION_RESOLVER
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749

# 결과가 등록된 결정 — MATCH (종료코드 0)
node --experimental-strip-types verifier/src/cli.ts \
  0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888 --json
```

검증기는 온체인 정산을 읽고, **업비트 공개 1분봉으로 관측값을 직접 다시 계산해** 대조합니다.

| 종료코드 | 뜻 |
|---|---|
| 0 | `MATCH` — 온체인 정산이 재계산과 일치 |
| 1 | `MISMATCH` — **일치하지 않음** |
| 2 | 조회 실패 |
| 3 | 검증할 대상 없음 (관측 불가 / 미정산) |

> `3`을 따로 둔 이유: `0`으로 두면 "검증됨"과 구별되지 않고, `1`로 묶으면 "틀림"과 뭉개집니다.
> **검증하지 못한 것과 틀린 것은 다릅니다.**

## 6. 공개된 내용이 커밋 당시의 그것과 같다

결정 본문은 커밋 시점에 해시로만 올라갑니다. 나중에 `(salt, 원문)`을 공개하면
누구나 대조할 수 있습니다.

```bash
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749

node --experimental-strip-types verifier/src/reveal-cli.ts \
  0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938 \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  --payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc https://sepolia-rpc.giwa.io/
```

**기대**: `판정: MATCH` — 온체인 commitment 와 재계산 commitment 가 같습니다.

> **`--payload` 는 JSON 이다.** 결정 본문이 문자열이면 큰따옴표까지 포함해야 한다.
> 환경변수 둘은 **필수다** — 없으면 `POI_DECISION_SCHEMA_UID 환경 변수가 …` 로 즉시 멈춘다.


## 7. 남의 커밋을 베껴도 자기 것이 되지 않는다 (CT18)

commitment 프리이미지에 **attester 주소**가 들어갑니다.

```
C = keccak256( TAG ‖ chainId ‖ attester ‖ salt ‖ utf8(JCS(payload)) )
```

B가 A의 commitment를 그대로 복사해 커밋해도, A의 `(salt, payload)`로 검증하면
**불일치**가 나옵니다. B의 주소로 계산되기 때문입니다.

**검증 도구는 attester를 입력받지 않습니다** — 온체인에서 읽습니다.
입력받게 만들면 공격자가 원래 attester를 타이핑해 거짓 일치를 만들 수 있습니다.

## 8. 이의가 온체인에 남는다

제3자가 관측값에 이의를 제기하면 온체인에 기록됩니다.

**다만 이의 "건수"는 어디에도 표시하지 않습니다.** 지갑 생성 비용이 사실상 0이라
건수는 언제든 부풀릴 수 있습니다. 목록과 각 이의자의 검증 지갑 여부만 보여줍니다.

## 9. 테스트

```bash
(cd contracts && forge test)            # 169
(cd core      && npm test)              # 62
(cd verifier  && npm test)              # 59
(cd web       && npm test)              # 96
(cd web       && npm run test:e2e)      # 37 (실제 체인 상대)
```

각 줄을 괄호로 감싼 이유: `cd` 가 셸에 남으면 다음 줄이 `contracts/core` 를 찾아 실패한다.

포크 테스트(`FOUNDRY_PROFILE=fork`)는 **실제 EAS 바이트코드**를 상대로 돕니다 —
모의 객체가 아닙니다.

---

## 이 문서가 지키려는 것

**"검증 가능하다"고 쓰는 것과 검증 가능한 것은 다릅니다.**

위 항목 중 하나라도 실행해서 실패한다면 그건 결함입니다. 실제로 그렇게 세 번 잡았습니다.

- 화면을 눈으로 보다가 **조건 기호 6개가 전부 잘못 표시되던 것** (`op=1`은 `≥`인데 `≠`)
- 지갑을 연결하고서야 **nav 가 본문 제목을 가리던 것**
- 이 문서의 **2번 명령이 틀렸던 것** — `$(cat …)` 가 끝 개행을 지워 해시가 달라졌습니다

**셋 다 단위 테스트가 통과하는 동안 살아 있었습니다.**
