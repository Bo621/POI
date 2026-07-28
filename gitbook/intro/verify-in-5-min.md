# 직접 확인하기

**POI의 주장은 "우리를 믿어라"가 아닙니다. 아래는 전부 직접 확인할 수 있습니다.**

준비물은 `cast`(Foundry)와 Node 22+뿐입니다. 지갑도 가스도 필요 없습니다 — 전부 읽기입니다.

```bash
export RPC=https://sepolia-rpc.giwa.io/
export EAS=0x4200000000000000000000000000000000000021
export DECISION_RESOLVER=0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66
```

정확한 UID는 [배포된 주소와 UID](deployed.md)에 있습니다.

---

## 1. 컨트랙트가 실제로 GIWA에 있다

```bash
cast code $DECISION_RESOLVER --rpc-url $RPC | head -c 20
```

익스플로러에서 소스도 검증돼 있습니다 (`Pass - Verified`):
`https://sepolia-explorer.giwa.io/address/0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66`

## 2. 지표 정의가 문서에 고정돼 있고 바꿀 수 없다

지표마다 **계산식·데이터 출처·간격·결측치 정책**을 적은 문서가 있고,
그 **문서 바이트의 해시**가 온체인에 박혀 있습니다.

```bash
# 온체인에 기록된 definitionHash
cast call $DECISION_RESOLVER \
  "metrics(bytes32)(bool,uint8,uint8,bytes32,bool)" \
  "0x83b04966e07f0f83592e71060b3356d7""16b4dff9f824bd76d0f9d149c54cafcf" --rpc-url $RPC

# 저장소의 정의 문서 해시
cast keccak "$(cat docs/metrics/BTC_PRICE_KRW_AT_END.md)"
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
git clone <repo> && cd poi && pnpm install
export POI_RPC_URL=$RPC
export POI_EAS_ADDRESS=$EAS
export POI_SETTLEMENT_RESOLVER_ADDRESS=0xbc386addcd3cabbbb62dfcb521939fe4610029d1
export POI_METRIC_REGISTRY_ADDRESS=$DECISION_RESOLVER

node --experimental-strip-types verifier/src/cli.ts <decisionUID> --json
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
node --experimental-strip-types verifier/src/reveal-cli.ts <decisionUID> \
  --salt <salt> \
  --payload <(printf '%s' '<원문 JSON>') \
  --rpc $RPC
```

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
cd contracts && forge test              # 150
cd core      && npm test                # 62
cd verifier  && npm test                # 58
cd web       && npm test                # 87
cd web       && npm run test:e2e        # 27 (실제 체인 상대)
```

포크 테스트(`FOUNDRY_PROFILE=fork`)는 **실제 EAS 바이트코드**를 상대로 돕니다 —
모의 객체가 아닙니다.

---

## 이 문서가 지키려는 것

**"검증 가능하다"고 쓰는 것과 검증 가능한 것은 다릅니다.**

위 항목 중 하나라도 실행해서 실패한다면 그건 결함입니다. 실제로 개발 중
화면을 눈으로 확인하다가 **조건 기호 6개가 전부 잘못 표시되던 것**을 발견했습니다
(`op=1`은 `≥`인데 `≠`로 표시). 단위 테스트 80개가 통과하는 동안 아무도 잡지 못했습니다.
