# W-DESIGN 증서 톤 디자인 시스템 적용

## 컨셉 — 등기·증서

POI는 "예쁜 앱"이 아니라 **기록물**이다. 사용자가 여기서 하는 일은 나중에 남에게
보여줄 증거를 만드는 것이고, 그 증거는 되돌릴 수 없다. 그러니 화면은 **문서의 격**을
가져야 한다. 등기부·계약서·공증서가 참조 대상이다.

**기억에 남을 한 가지: 인장(印章).** 상태 배지를 알약(pill) 모양이 아니라
**붉은 인주로 찍은 도장**처럼 그린다. 온체인 발행이 성공하면 도장이 한 번 찍힌다.
그 외의 장식은 두지 않는다.

### 이 톤에서 하지 않는 것

- 카드로 감싸지 않는다. 증서는 카드가 아니라 **괘선(罫線)**으로 구획된다.
- 둥근 모서리·드롭섀도우·글래스모피즘·그라디언트 텍스트를 쓰지 않는다.
- 다크모드를 기본으로 두지 않는다. 문서는 흰 바탕이 기본이다(다크는 지원만 한다).
- 아이콘을 제목 위에 얹지 않는다. 이 UI에 아이콘은 거의 필요 없다.
- 모달을 쓰지 않는다 — **salt 백업 화면(W3)만 예외**다. 그것은 진행을 막아야 하는
  단 하나의 관문이라 모달이 옳다.

---

## 1. 타이포그래피

Google Fonts에서 세 가지만 받는다. `web/index.html`에 `<link>`로 넣는다
(`preconnect` 포함, `display=swap`).

| 역할 | 폰트 | 쓰는 곳 |
|---|---|---|
| 표제 | **Gowun Batang** (고운바탕) 400/700 | 문서 제목, 절 제목, 상태 문구 |
| 본문·UI | **IBM Plex Sans KR** 400/500/600 | 라벨, 설명, 버튼, 입력 |
| 수치·해시 | **IBM Plex Mono** 400/500 | 0x 해시, UID, 숫자, 시각 |

```
--font-display: "Gowun Batang", serif;
--font-body: "IBM Plex Sans KR", sans-serif;
--font-mono: "IBM Plex Mono", monospace;
```

- 모노스페이스는 **16진수·UID·타임스탬프에만** 쓴다. 분위기용으로 쓰지 않는다.
- 숫자에는 `font-variant-numeric: tabular-nums`를 준다 — 표에서 자릿수가 흔들리면 안 된다.

### 타입 스케일 (fluid, clamp)

```
--text-xs:   clamp(0.75rem, 0.73rem + 0.1vw, 0.8125rem)
--text-sm:   clamp(0.8125rem, 0.79rem + 0.12vw, 0.875rem)
--text-base: clamp(0.9375rem, 0.91rem + 0.15vw, 1rem)
--text-lg:   clamp(1.0625rem, 1.02rem + 0.25vw, 1.1875rem)
--text-xl:   clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)
--text-2xl:  clamp(1.625rem, 1.4rem + 1.1vw, 2.25rem)
```

- 문서 제목(`h1`)은 `--text-2xl` / Gowun Batang 700 / `letter-spacing: -0.01em`.
- 절 제목(`h2`)은 `--text-lg` / Gowun Batang 700. **위에 두 줄 괘선**을 둔다(§3).
- 라벨은 `--text-sm` / IBM Plex Sans KR 600 / `letter-spacing: 0.02em`.
- 본문 `line-height: 1.7` (한글은 넉넉해야 읽힌다). 제목은 `1.25`.

---

## 2. 색 — 미색 바탕, 먹, 인주

`oklch`로 쓴다. 순흑·순백을 쓰지 않는다.

```css
:root {
  color-scheme: light dark;

  /* 바탕 — 미색 종이 */
  --paper:       oklch(0.977 0.008 85);
  --paper-sunk:  oklch(0.955 0.010 85);   /* 입력 필드, 인용 */

  /* 글자 — 먹 */
  --ink:         oklch(0.255 0.012 60);
  --ink-soft:    oklch(0.455 0.010 60);   /* 보조 설명 */
  --ink-faint:   oklch(0.62 0.008 60);    /* 비활성 */

  /* 괘선 */
  --rule:        oklch(0.86 0.012 80);
  --rule-strong: oklch(0.72 0.014 75);

  /* 인주 — 유일한 강조색 */
  --seal:        oklch(0.55 0.185 28);
  --seal-soft:   oklch(0.55 0.185 28 / 0.10);

  /* 쪽빛 — 확정·검증 */
  --indigo:      oklch(0.46 0.095 250);
  --indigo-soft: oklch(0.46 0.095 250 / 0.10);
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper:       oklch(0.205 0.010 70);
    --paper-sunk:  oklch(0.245 0.010 70);
    --ink:         oklch(0.925 0.008 85);
    --ink-soft:    oklch(0.76 0.008 80);
    --ink-faint:   oklch(0.58 0.008 75);
    --rule:        oklch(0.34 0.010 70);
    --rule-strong: oklch(0.46 0.012 70);
    --seal:        oklch(0.66 0.16 28);
    --indigo:      oklch(0.70 0.09 250);
  }
}
```

**색 배정 규칙 — 이것만 지킨다.**

| 의미 | 색 |
|---|---|
| 기본 글자·괘선 | 먹 계열 |
| **주의·되돌릴 수 없음·기한 초과·이의** | 인주(`--seal`) |
| **확정·검증됨** | 쪽빛(`--indigo`) |
| 그 외 | 색을 쓰지 않는다 |

상태색을 7상태에 하나씩 배정하지 말 것. 색이 많아지면 아무것도 강조되지 않는다.

---

## 3. 괘선과 여백 — 카드 대신 구획

절(`section`)은 **두 줄 괘선**으로 연다. 등기부의 정간(井間)에서 온 형태다.

```css
.doc-section {
  border-top: 1px solid var(--rule-strong);
  box-shadow: 0 3px 0 -2px var(--rule);   /* 두 번째 얇은 선 */
  padding-top: var(--space-6);
  margin-top: var(--space-9);
}
```

리듬을 위해 간격을 균일하게 쓰지 않는다.

```
--space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
--space-4: 1rem;     --space-6: 1.5rem;   --space-9: clamp(2rem, 1.5rem + 2vw, 3.5rem);
--space-12: clamp(3rem, 2rem + 4vw, 6rem);
```

- 라벨과 그 입력은 `--space-2`로 **붙인다**.
- 필드 묶음 사이는 `--space-6`.
- 절 사이는 `--space-9`.
- 문서 제목 아래는 `--space-12`.

### 페이지 골격

```
본문 폭  min(68ch, 100% - 2rem)   좌우 auto 마진
좌측 정렬. 가운데 정렬하지 않는다.
문서 머리(제목 + 발행 체인 + 접속 지갑)는 상단에 두고 아래로 두 줄 괘선.
```

### 항목 나열은 표가 아니라 **정의 목록**

결정·정산의 필드는 `<dl>`로 쓴다. 라벨 열은 고정, 값은 흐른다.

```css
.doc-fields { display: grid; grid-template-columns: minmax(7.5rem, 12ch) 1fr; gap: var(--space-2) var(--space-4); }
.doc-fields dt { font: 600 var(--text-sm)/1.5 var(--font-body); color: var(--ink-soft); letter-spacing: 0.02em; }
.doc-fields dd { margin: 0; font-size: var(--text-base); }
.doc-fields dd.hex { font-family: var(--font-mono); font-size: var(--text-sm); word-break: break-all; }
```

`@container` 또는 `@media (max-width: 34rem)`에서 한 열로 무너뜨린다 — 라벨을 숨기지 않는다.

---

## 4. 인장 — 이 화면에서 기억될 하나

상태 표시(W7)와 발행 성공을 **도장**으로 그린다. 이미지·SVG 파일을 만들지 않는다.
원형 테두리 + 세로쓰기 한글 + 인주색. CSS만으로 만든다.

```css
.seal {
  --seal-size: 5.5rem;
  inline-size: var(--seal-size); block-size: var(--seal-size);
  display: grid; place-items: center;
  border: 2.5px solid var(--seal); border-radius: 50%;
  color: var(--seal);
  font: 700 var(--text-lg)/1.15 var(--font-display);
  letter-spacing: 0.04em;
  text-align: center;
  background: var(--seal-soft);
  transform: rotate(-6deg);          /* 손으로 찍은 각도 */
}
.seal--indigo { border-color: var(--indigo); color: var(--indigo); background: var(--indigo-soft); }
```

상태별 인장 문구 (2~4글자, Gowun Batang):

| 상태 | 인장 | 색 |
|---|---|---|
| `NOT_REQUIRED` | 해당없음 | 먹(`--ink-faint`) |
| `PENDING` | 대기 | 먹 |
| `OBSERVING` | 관측중 | 먹 |
| `AWAITING` | 정산대기 | 먹 |
| **`OVERDUE`** | **기한초과** | **인주** |
| `SETTLED` | 정산완료 | 쪽빛 |
| `SETTLED_LATE` | 지연정산 | 쪽빛 |

「정산 철회 이력 있음」은 인장 **아래 별도 줄**로, 인주색 작은 글씨. 인장 안에 넣지 않는다.

### 찍히는 동작

온체인 발행이 성공했을 때 한 번만 재생한다. 0.42s, `cubic-bezier(0.16, 1, 0.3, 1)`.
`transform`과 `opacity`만 움직인다.

```css
@keyframes seal-stamp {
  from { transform: rotate(-6deg) scale(1.5); opacity: 0; }
  60%  { opacity: 1; }
  to   { transform: rotate(-6deg) scale(1); opacity: 1; }
}
.seal--stamping { animation: seal-stamp 0.42s cubic-bezier(0.16, 1, 0.3, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .seal--stamping { animation: none; }
}
```

바운스·일래스틱을 쓰지 않는다.

---

## 5. 폼과 버튼

증서의 기입란처럼 **밑줄 입력**을 쓴다. 상자를 그리지 않는다.

```css
input, textarea, select {
  inline-size: 100%;
  padding: var(--space-2) var(--space-1);
  font: 400 var(--text-base)/1.6 var(--font-body);
  color: var(--ink);
  background: var(--paper-sunk);
  border: 0; border-bottom: 1.5px solid var(--rule-strong);
  border-radius: 0;
}
input:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--indigo); outline-offset: 2px;
  border-bottom-color: var(--indigo);
}
input[type="text"].hex, input.uid { font-family: var(--font-mono); font-size: var(--text-sm); }
```

버튼 위계는 셋이다. **모든 버튼을 primary로 만들지 않는다.**

```css
/* 되돌릴 수 없는 온체인 발행 — 인주 테두리. 화면에 하나만 */
.btn-commit { background: var(--seal); color: var(--paper); border: 0; padding: var(--space-3) var(--space-6);
              font: 600 var(--text-base) var(--font-body); border-radius: 2px; }
.btn-commit:disabled { background: var(--ink-faint); cursor: not-allowed; }

/* 보조 — 조회·계산 */
.btn { background: transparent; color: var(--ink); border: 1px solid var(--rule-strong);
       padding: var(--space-2) var(--space-4); border-radius: 2px; }

/* 3순위 — 철회·삭제 등 */
.btn-quiet { background: none; border: 0; color: var(--ink-soft); text-decoration: underline;
             text-underline-offset: 3px; padding: var(--space-1) 0; }
```

`border-radius`는 최대 `2px`. 둥글리지 않는다.

---

## 6. 경고 문구 — 장식에 묻히지 않게

명세가 **상시 표시**를 요구하는 문구들이 있다. 이것들은 눈에 띄되 광고처럼 보이면 안 된다.
좌측 인주색 세로선 + 미색 배경, 아이콘 없음.

```css
.notice {
  border-inline-start: 3px solid var(--seal);
  background: var(--seal-soft);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm); line-height: 1.65;
}
.notice--quiet { border-inline-start-color: var(--rule-strong); background: var(--paper-sunk); color: var(--ink-soft); }
```

| 문구 | 어디에 | 종류 |
|---|---|---|
| 이 기록은 검증되지 않습니다 | 저널(W2) | `.notice` |
| salt를 잃어버리면 이 기록은 영구히 공개할 수 없습니다 | salt 백업(W3) | `.notice` |
| trigger는 온체인에서 강제되지 않습니다 | 결정 커밋(W4) | `.notice--quiet` |
| 아래 항목은 평문으로 온체인에 기록됩니다 | 결정 커밋(W4) | `.notice` |
| 결과는 관측값으로부터 컨트랙트가 판정합니다 | 정산(W5) | `.notice--quiet` |
| 조회된 것이 전부라는 보장은 없습니다 | 이의 목록(W6) | `.notice--quiet` |
| 검증 지갑 스냅샷 UID를 찾지 못했습니다 | 지갑(W1) | `.notice--quiet` |
| 컨트랙트가 아직 배포되지 않았습니다 | 미배포 상태 | `.notice` |

---

## 7. 문서 머리

```
POI  판단 증서                      ← Gowun Batang 700, --text-2xl
GIWA Sepolia · chainId 91342        ← IBM Plex Mono, --text-xs, --ink-faint
0x77E8…dfaa  미검증 지갑 (사용 가능)  ← 주소는 mono, 배지는 body 600
────────────────────────────────    ← 두 줄 괘선
```

지갑 배지는 인장을 쓰지 않는다(작다). 텍스트 + 좌측 2px 세로선으로:
검증 지갑 = 쪽빛, 미검증 = 먹, 확인 불가 = 인주.

---

## 8. 구현 범위

- 수정: `web/src/styles.css` — 전면 재작성. 위 토큰과 컴포넌트 클래스를 전부 정의한다.
- 수정: `web/index.html` — Google Fonts `<link>` 3종 + `lang="ko"` 확인.
- 수정: `web/src/*.tsx` **전부** — 마크업에 위 클래스를 적용한다.
  - `App.tsx`: 문서 머리 + 절 구조(`.doc-section`)
  - `wallet.tsx`: 지갑 배지 + 미해결 UID 안내
  - `journal.ts`/`note.tsx`: 저널 경고 문구
  - `decision.tsx`: 정의 목록 + 평문 공개 항목 안내 + `.btn-commit`
  - `saltBackup.tsx`: 모달 (유일한 예외)
  - `settlement.tsx` · `challenge.tsx` · `status.tsx` · `reveal.tsx`
  - `status.tsx`: **인장** 렌더링 + 찍히는 동작
- **로직을 바꾸지 말 것.** 클래스·마크업 구조만 바꾼다. 순수 함수와 그 테스트는 그대로다.
- `core/`·`contracts/`·`verifier/` 수정 금지.
- CSS 프레임워크·아이콘 라이브러리·애니메이션 라이브러리를 설치하지 말 것.

## 9. 접근성

- 모든 입력에 `<label>`이 연결돼 있어야 한다(`htmlFor`).
- 포커스 링을 지우지 말 것. `:focus-visible`로 쪽빛 2px.
- 인장은 장식이 아니라 정보다 — `role="img"`와 `aria-label`(예: `"상태: 기한 초과"`)을 준다.
- 색만으로 상태를 구별하지 않는다. 인장에는 **항상 글자**가 들어간다.
- 본문 대비는 WCAG AA 이상. `--ink-faint`는 큰 글자·비활성에만 쓴다.

## 10. 검증

```
cd web && npx tsc --noEmit    # 오류 0
cd web && npm test            # 40/40 그대로 (로직을 바꾸지 않았으므로)
cd web && npm run build       # 통과
```

테스트 수가 줄면 로직을 건드린 것이다 — 되돌릴 것.
