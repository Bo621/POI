# SCENARIO-FIX 수동 시나리오에서 나온 결함 5건

`docs/TEST_SCENARIO.md` S1~S12를 Claude가 브라우저로 직접 따라가며 찾은 것.
**E2E 26개가 전부 통과하는데도 아래는 잡히지 않았다** — 테스트가 "존재"만 보고
"내용"을 보지 않았기 때문이다. 고치면서 **E2E도 내용을 보게 강화한다.**

## 파일

- 수정: `web/src/challenge.tsx` · `web/src/decisionDetail.tsx` · `web/src/styles.css` ·
  `web/src/home.tsx`(최근 목록) · `web/e2e/*`
- **로직의 의미를 바꾸지 말 것.** `core/`·`contracts/`·`verifier/`·`scripts/` 수정 금지.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

---

## 1. `[P1]` 이의 목록에 누가 무엇을 주장하는지 없다

지금 목록 항목:

```html
<span class="hex">0xd9ee…befa</span><span> · 확인 불가</span>
```

**이의 UID와 검증 지갑 상태뿐이다.** 이의자 주소도, 주장 결과도, 출처도 없다.
이의 목록의 존재 이유가 "누가 무엇을 주장하는가"인데 그게 빠졌다.

`SITEMAP.md` §4.4 와이어프레임이 요구한 것:

```
0xabc…  0x7099…79C8  미검증 지갑  NOT_OBSERVED  출처 other-exchange
```

### 고칠 것

`challenge.tsx`의 목록 항목에 아래를 표시한다.

| 항목 | 표시 |
|---|---|
| 이의 UID | 축약 (mono) |
| **이의자 주소** | 축약 (mono) + 검증 지갑 여부(`미검증 지갑`/`검증 지갑`/`확인 불가`) |
| **주장 결과** | `OBSERVED` / `NOT_OBSERVED` / `INDETERMINATE` |
| **관측값** | 있으면 값, 없으면 `관측값 없음` |
| **출처** | 문자열 |

- 이의 데이터를 이미 로그에서 읽고 있으므로 **디코딩만 추가**하면 된다.
  `readChallengeLogs`가 payload를 디코딩하지 않는다면 그것부터 고친다.
- **건수·정렬·랭킹은 여전히 금지.** 조회 순서 그대로.
- 「조회된 것이 전부라는 보장은 없습니다.」는 유지.

### E2E 강화

지금 테스트는 `ul.record-list > li` 개수만 본다. **내용을 본다:**

```
이의 항목에 이의자 주소(B)와 주장 결과 문자열이 보인다
```

---

## 2. `[P1]` 이전 정산(철회됨)을 펼칠 수 없다

F2 상세에 「정산 철회 이력 있음」은 뜨는데 `▸ 이전 정산 (철회됨)` `<details>`가 없다.
**정정 이력을 보여주는 것이 F2의 존재 이유**다.

`decisionDetail.tsx`가 `previous`를 그리는 조건이 만족되지 않는다.
`readSettlementState`가 `lastHead`를 주는지, 그것이 `activeHead`와 다를 때
이전 정산을 조회하는지 확인할 것. **원인을 찾아 고친다.**

`lastHead == activeHead`인 경우(정정이 없었던 경우)에는 그리지 않는 것이 맞다.
F2는 `revokeCount == 1`이고 `lastHead != 철회된 S1`이므로 —
**철회된 정산은 `lastHead`가 아니라 이전 head다.** 어떻게 찾을지 다시 봐야 한다:

```
S1 발행 → activeHead=S1, lastHead=S1
S1 철회 → activeHead=0,  lastHead=S1        ← 철회된 것이 lastHead
S2 발행 → activeHead=S2, lastHead=S2        ← 덮인다
```

**정정 후에는 온체인에 S1로 가는 포인터가 없다.**
S2의 `supersedes` 필드가 S1을 가리킨다 — **거기서 찾아야 한다.**
`활성 정산의 supersedes`가 0이 아니면 그 UID를 이전 정산으로 조회한다.
필요하면 `supersedes`를 따라 여러 단계 거슬러 올라간다(상한 8단계).

### E2E 강화

```
F2 상세에서 ▸ 이전 정산 (철회됨)을 펼치면 철회된 정산의 UID와 결과가 보인다
```

---

## 3. `[P1]` 상태가 스스로 갱신되지 않는다

시간이 지나도 화면이 그대로고 **새로고침해야** 바뀐다.
`decisionDetail.tsx`가 `getChainTime()`을 **최초 1회만** 부른다.

OVERDUE 데모의 핵심이 "화면에서 상태가 넘어가는 것"인데 지금은 보여줄 수 없다.

### 고칠 것

이미 있는 `chainClock`(`useChainTime`)을 상세에서도 쓴다.

- 1초마다 로컬 증가 + 15초마다 체인 재동기화 (이미 구현돼 있다)
- **`deriveState`에 그 값을 넘긴다.**
- 상태가 바뀌면 인장이 바뀌고, `.seal--stamping` 애니메이션이 **다시 재생되지 않게** 한다
  (최초 1회만. 매초 다시 찍히면 산만하다).
- `activeHead`·`revokeCount` 같은 온체인 값까지 매초 다시 읽지 말 것.
  **시각만 흐르고 나머지는 그대로**여야 한다.

### E2E 강화

```
F5 상세를 연 채로 evm_increaseTime 으로 windowStart를 넘기면
새로고침 없이 20초 안에 인장이 대기 → 관측중으로 바뀐다
```

---

## 4. `[P2]` 「최근 열어본 증서」의 UID가 세로로 쪼개진다

한 글자씩 세로로 쌓여 렌더링된다. 그리드 열 폭이 0에 가깝거나 `word-break`가 과하다.

`recordRow`와 같은 한 줄 형식을 쓰게 하고, hex는
`overflow-wrap: anywhere` 대신 **축약**해서 넘치지 않게 한다.
`.hex`에 `min-inline-size: 0`을 주어 그리드 자식이 줄어들 수 있게 한다.

## 5. `[P2]` 작은 인장에서 4글자가 원 밖으로 넘친다

`기한초과`·`정산대기`·`해당없음`이 `.seal--sm`을 넘어간다.

- 지름을 키우거나(2.5rem → 3rem) 글자 크기를 줄인다.
- 2글자씩 두 줄로 배치한다(`inline-size: 2.2em`으로 감싸 자연 줄바꿈).
- **문구를 줄이지 말 것** — 상태 문구는 이미 한 곳으로 통일했다.

---

## 검증

```
bash scripts/dev_up.sh
cd web && npx tsc --noEmit && npm test && npm run build
cd web && npm run test:e2e          # 26 + 강화분, skipped 0
```

그리고 브라우저에서 **S1·S4·S6·S7을 다시 확인**한다:

- 홈의 최근 목록이 한 줄로 보이고 인장 글자가 원 안에 들어간다
- F2 상세에서 이전 정산을 펼칠 수 있다
- F1 상세의 이의 항목에 이의자 주소와 주장 결과가 보인다
- F5 상세를 연 채 시간을 밀면 새로고침 없이 인장이 바뀐다
