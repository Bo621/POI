# SUBMISSION 제출 수준까지 — 무엇이 남았나

codex 리뷰(2026-07-28)로 드러난 것: **로컬 포크 시나리오는 제출물이 아니라 리허설이다.**
`PLAN.md` §5 완료 정의와 명세 §12.0은 **실제 체인의 공개 기록**을 요구한다.

이 문서는 "심사자가 무엇을 요구할 것인가"를 기준으로 남은 일을 정리한다.

---

## 0. 심사자가 할 법한 요구와 지금의 답

| 심사자 | 지금 답할 수 있나 |
|---|---|
| "공개 UID와 익스플로러 링크를 주고, verifier를 직접 돌려보게 해달라" | **아니오.** 배포되지 않았다 |
| "verifier가 데이터를 가져오는가, 제출된 관측값을 되풀이하는가?" | **되풀이한다.** provider 구현이 없다 |
| "UI로 커밋→정산→이의→reveal 전 경로를 성공시켜 보여달라" | 브랜치에만 있고 온체인 대상이 없다 |
| "타인이 남의 commitment를 복사하면?" | 클라이언트 대조로 막힌다 (증명 가능) |
| "공격 테스트 19종" | **통과.** 포크에서 실제 EAS 상대 37/37 |
| "문서는 지표 6종인데 구현은 2종인 이유는?" | **답이 문서에 없다.** 재범위화를 명시해야 한다 |

---

## 1. `[P1]` 지표 provider 구현 — 없으면 "독립 재계산"이 거짓이다

`PLAN.md` §5: *"verifier가 온체인 정산을 독립적으로 재계산해 일치"*

현재 `verifier/src/cli.ts`는 `MetricRegistry`를 **아예 넘기지 않는다.** 그래서 항상
`NO_OBSERVATION` 경로를 타고, 그것이 **종료코드 0**이다. 지금 verifier가 증명하는 것은
"온체인 값이 자기정합적이다"뿐이고, 그건 컨트랙트가 이미 강제한 것이라 새로운 정보가 없다.

### 만들 것

`verifier/src/providers/upbit.ts` — `docs/metrics/*.md`에 적힌 규칙 **그대로**.

| | |
|---|---|
| 엔드포인트 | `GET https://api.upbit.com/v1/candles/minutes/1?market=KRW-BTC&to=…&count=200` |
| 페이지네이션 | `to`를 가장 오래된 봉으로 옮기며 `t(c) < windowStart`가 나올 때까지 |
| 봉 선택 | `windowStart <= t(c)` ∧ `t(c) + 60 <= windowEnd` |
| `BTC_PRICE_KRW_AT_END` | 그중 가장 늦은 봉의 `trade_price`. 없으면 INDETERMINATE |
| `BTC_MAX_DRAWDOWN_IN_WINDOW` | 종가 계열 최대낙폭. 봉 2개 미만이면 INDETERMINATE. **정수 산술** `(peak-p)*1000/peak` |
| 재시도 | 지수 백오프 3회 |

**"데이터가 없다"와 "조회에 실패했다"를 구별한다.** 문서 §5가 요구하는 것이다.
지금 `MetricProvider.observe()`는 `undefined` 하나로 둘을 뭉갠다 —
`observe()`가 `{kind: "ok", ...} | {kind: "insufficient"} | {kind: "error", reason}`를 돌려주게 바꾼다.
`error`는 `INDETERMINATE`가 아니라 **검증 실패**다.

### 종료코드를 고친다

| 판정 | 지금 | 바꿀 것 |
|---|---|---|
| `MATCH` | 0 | 0 |
| `MISMATCH` | 1 | 1 |
| `NO_OBSERVATION` | **0** | **3** |
| 사용법·조회 실패 | 2 | 2 |

codex 지적: 정산이 있고 예상 결과가 선언된 결정에서 `NO_OBSERVATION`이 0이면
"검증됨"과 구별되지 않는다. 다만 `MISMATCH`와 같은 1로 묶으면 "틀렸다"와 "확인 못 했다"가
뭉개진다 — 그래서 **3을 새로 둔다.** 이 판단은 문서에 남긴다.

### 온체인 지표 등록 대조

verifier가 `POIMetricRegistry.metrics(metricId)`를 읽어 확인한다.

- `allowed == true` · `frozen == true` · `kind == 0`
- `decimals`가 `docs/metrics/manifest.json`과 일치
- **`definitionHash`가 manifest와 일치** — 다르면 "이 체인에 등록된 지표는 우리 문서가
  정의한 지표가 아니다"이므로 즉시 검증 실패

### 스냅샷 해시를 리포트에 넣는다

문서 §7이 요구한다. `VerifyReport`에 `snapshot`(사용한 봉 배열)과 `snapshotHash`를 넣고,
`--json`에 그대로 나오게 한다. 심사자가 **같은 입력으로 재현**할 수 있어야 한다.

### `now`도 체인 시간으로

`cli.ts:41`이 `Date.now()`를 쓴다. 프론트와 같은 문제다 — `reader`에 `getChainTime()`을 추가해 쓴다.

---

## 2. `[P1]` 지표 6종 vs 2종 — 문서 정합성

- 명세 §11.2와 §12.1: **6종**
- `PLAN.md` §5: `metric 6종 frozen 등록`
- 실제: **2종** (2026-07-28 사용자 결정)

심사자가 가장 먼저 짚을 불일치다. **구현을 늘리지 말고 문서를 정직하게 고친다.**

- `docs/PLAN.md` §5의 `metric 6종` → `metric 2종 (MVP) — 나머지 4종은 Phase 1`
  + 그 아래에 재범위화 근거 한 줄
- `docs/BACKLOG.md`는 이미 반영돼 있다
- **`docs/POI_TechSpec_v3.md`는 수정하지 않는다** (원본 문서). 대신 `PLAN.md`에
  "명세 §11.2 대비 축소. 지표는 append-only라 Phase 1에 추가 가능하며,
  등록하지 않은 지표는 컨트랙트가 거부하므로 안전하다"를 적는다

같은 방식으로 **W9~W12(DAG·Passport·등급·Π_forced)**도 정리한다.
`PLAN.md` §5 완료 정의에는 이들이 **없고**, 명세 §12.2 체크리스트에는 **있다**.
어느 쪽을 제출 기준으로 삼는지 문서에 한 줄로 못 박는다. 애매하게 두면 심사자가 짚는다.

---

## 3. `[P1]` 실제 배포와 공개 증거

`PLAN.md` §5와 명세 §12.0이 요구하는 것. **로컬 포크로 대체되지 않는다.**

```
O3  GIWA Sepolia 배포 (Deploy.s.sol — 포크 드라이런 통과, 가스 7.5M ≈ 0.0000075 ETH)
O5  addMetric × 2 (manifest의 definitionHash)
O4  OVERDUE fixture 즉시 커밋   ← 배포 직후. windowEnd = now+10분, grace = 1시간
    → 약 1시간 10분 뒤에야 OVERDUE가 된다. 이 리드타임이 녹화를 막는 유일한 실시간 제약이다
O7  fixture 세트 — SETTLED / 철회→정정 / 이의 있음 / OVERDUE
O8  녹화 — OVERDUE·이의·철회 이력이 화면에 보여야 한다
```

### 배포 증거 manifest — `docs/DEPLOYMENT.md` (신설, 커밋)

심사자가 이 파일 하나로 전부 확인할 수 있어야 한다.

```
chainId · 배포 블록 · 배포 tx 해시
리졸버 4종 주소 + 익스플로러 링크
스키마 4종 UID + revocable 플래그
지표 2종 metricId · decimals · definitionHash (manifest와 일치)
fixture 4종 UID + tx 해시 + 기대 상태
verifier 실행 명령 한 줄과 그 출력 (MATCH)
```

**O2 법률 검토는 사용자가 정식 배포 시점으로 미뤘다.** 이 테스트넷 배포는 그 결정에 따라 진행한다.

---

## 4. `[P1]` UI 성공 경로를 실제로 보여준다

지금 시나리오는 **시드된 상태를 읽는 것**과 **실패 케이스**가 중심이다.
심사자는 "직접 만들어 보라"고 한다.

fixture를 씨앗으로 두되, **사람이 UI에서 처음부터 끝까지 한 번** 하는 경로를 시나리오에 넣는다.

```
지갑 연결 → 저널 작성 → 노트 승격 → salt 백업 → 결정 커밋
→ (시간 경과) → 정산 발행 → 다른 지갑으로 이의 → reveal 공개·대조
```

각 단계에서 **온체인 tx 해시가 화면에 남아야** 심사자가 익스플로러로 따라갈 수 있다.
지금 UI는 발행 후 UID만 보여준다 — **tx 해시와 익스플로러 링크를 함께 표시**하도록 고친다.

---

## 5. `[P1]` 시나리오 자체의 결함 4건 (codex 지적, 전부 타당)

| # | 무엇이 틀렸나 |
|---|---|
| 1 | **`forge script --broadcast`의 `vm.warp`는 외부 anvil 노드를 움직이지 않는다.** 시뮬레이션에만 적용된다. 시드를 단계로 쪼개고 사이에 `cast rpc evm_setNextBlockTimestamp` + `evm_mine`을 넣어야 한다 |
| 2 | **F5 시각이 자기모순이다.** "모든 결정은 `windowStart = T0+60`"과 "F5는 현재+1시간"과 "F4 점프 후에도 F5는 PENDING"이 동시에 성립하지 않는다. F5의 window를 F4 점프 **이후** 기준으로 다시 계산해야 한다 |
| 3 | **S8이 CT18이 아니다.** F1↔F2 UID를 바꾸는 것은 **같은 attester**라 복사 공격이 아니다. **B가 발행한 결정에 A의 commitment를 복사해 넣고**, A의 (salt, payload)로 대조하면 실패하는 것을 보여야 한다 |
| 4 | **fixture 관측값이 임의값이다** (92,000,000). verifier가 `MATCH`를 내려면 관측값이 **provider가 실제로 계산한 값**이어야 한다. 시드 시점에 provider를 돌려 그 값을 쓴다 |

---

## 6. `[P2]` 브라우저 E2E — 중간 지점을 택한다

원래 계획은 "지갑 서명이 필요하니 자동화하지 않는다"였다. codex 지적대로 **과했다.**
MetaMask 확장 자동화는 여전히 하지 않지만, 브라우저 배선 자체는 검증할 수 있다.

- Playwright를 시드된 anvil 포크 상대로 돌린다
- `page.addInitScript`로 **EIP-1193 provider를 주입**해 anvil 언락 계정에 포워딩한다.
  **제품 코드에 테스트용 경로를 뚫지 않는다** — 이것이 핵심이다
- 자동화 대상: 읽기 fixture 4종의 인장, 이의 목록 표시 규칙, reveal 정상/위조,
  결정→정산→이의 성공 경로 1회, 거부된 서명 1회
- 실제 GIWA Sepolia + MetaMask 흐름은 **녹화 1건**으로 남긴다

지금 web 테스트 40개는 인코더와 순수 함수만 본다. React → provider → RPC → 영수증 →
화면 갱신 배선은 **아무도 검증하지 않고 있다.**

---

## 7. 순서

```
1  [P1] 지표 provider 2종 + 종료코드 + 스냅샷 해시 + 온체인 지표 대조   ← 배포와 무관, 지금 가능
2  [P1] 문서 정합성 (PLAN.md §5 재범위화)                              ← 지금 가능
3  [P1] 시나리오 결함 4건 수정 + 로컬 시드 스크립트                      ← 지금 가능
4  [P2] Playwright 하이브리드                                          ← 3 이후
5  [P1] UI에 tx 해시·익스플로러 링크 표시                               ← 지금 가능
6  [P1] O3 배포 → O5 addMetric → O4 OVERDUE fixture                   ← 사람의 승인 필요
7  (1시간 10분 대기)
8  [P1] O7 fixture 세트 → docs/DEPLOYMENT.md → O8 녹화
```

**1~5는 배포 없이 지금 할 수 있다.** 6이 사람의 결정을 기다린다.
