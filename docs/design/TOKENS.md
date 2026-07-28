# POI 디자인 토큰 v2 — GIWA 정렬

> [CONCEPT.md](CONCEPT.md)의 결정을 값으로 옮긴 것.
> **이 문서의 값을 그대로 `web/src/styles.css`에 넣으면 된다. 판단할 것이 없다.**

## 0. 바꾸는 것 / 안 바꾸는 것

| | |
|---|---|
| **바꾼다** | `:root`와 `@media (prefers-color-scheme: dark)`의 **값**, 서체 3종, 신규 토큰 4개 |
| **안 바꾼다** | **토큰 이름**, 클래스명, DOM 구조, 화면 문구, `--space-*`, `--text-*` |

토큰 이름을 그대로 두는 이유: 이름을 바꾸면 `styles.css` 전체와 컴포넌트를 훑어야 하고
E2E가 깨질 여지가 생긴다. **값만 바꾸면 코드는 한 곳만 고치면 된다.**

## 1. GIWA 기준값 (2026-07-28 실측)

```
#000000  배경        #F5F5F0  본문        #FF2200  강조
#E8B84A  금색        #9A9A94  흐림        #2DD488  신호(미채택)
```

oklch 환산 — **구현 전 한 번 대조할 것** (계산으로 얻은 값이다):

```
#FF2200  →  oklch(0.637 0.249 30.9)
#E8B84A  →  oklch(0.806 0.136 85.0)
#F5F5F0  →  oklch(0.966 0.006 100)   근사
#9A9A94  →  oklch(0.660 0.006 100)   근사
```

## 2. 라이트 모드 — 한지 위의 증서

`:root` 안. **인주 계열만 GIWA 색상각으로 옮기고 나머지는 유지한다.**

```css
--paper:       oklch(0.977 0.008 85);     /* 유지 */
--paper-sunk:  oklch(0.955 0.010 85);     /* 유지 */
--ink:         oklch(0.255 0.012 60);     /* 유지 */
--ink-soft:    oklch(0.455 0.010 60);     /* 유지 */
--ink-faint:   oklch(0.620 0.008 60);     /* 유지 */
--rule:        oklch(0.860 0.012 80);     /* 유지 */
--rule-strong: oklch(0.720 0.014 75);     /* 유지 */

--seal:        oklch(0.580 0.210 30);     /* 변경 — 색상각 28 → 30, 채도 0.185 → 0.210 */
--seal-soft:   oklch(0.580 0.210 30 / 0.10);
--indigo:      oklch(0.460 0.095 250);    /* 유지 */
--indigo-soft: oklch(0.460 0.095 250 / 0.10);

/* 신규 */
--gold:        oklch(0.620 0.130 85);     /* 종이 위 가독성을 위해 GIWA 금색보다 어둡게 */
--gold-soft:   oklch(0.620 0.130 85 / 0.12);
--giwa-red:    oklch(0.637 0.249 30.9);   /* GIWA 원색. 라이트에서는 참조용으로만 둔다 */
```

`--seal`을 `0.637`까지 올리지 않는 이유: 한지색(`0.977`) 위에서 대비가 부족해진다.
**색상각과 채도로 GIWA에 정렬하고, 명도는 가독성에 맞춘다.**

`--gold`도 같은 이유로 GIWA 금색(`0.806`)보다 어둡다 — `0.806`은 흰 종이 위에서 읽히지 않는다.

## 3. 다크 모드 — 기와 지붕 아래

`@media (prefers-color-scheme: dark)` 안. **여기서 GIWA와 정확히 만난다.**

```css
--paper:       oklch(0.145 0.006 100);    /* 거의 검정. 완전 검정은 쓰지 않는다 */
--paper-sunk:  oklch(0.190 0.006 100);
--ink:         oklch(0.966 0.006 100);    /* = #F5F5F0 */
--ink-soft:    oklch(0.800 0.006 100);
--ink-faint:   oklch(0.660 0.006 100);    /* = #9A9A94 */
--rule:        oklch(0.300 0.006 100);
--rule-strong: oklch(0.420 0.008 100);

--seal:        oklch(0.637 0.249 30.9);   /* = #FF2200 — GIWA 원색과 동일 */
--seal-soft:   oklch(0.637 0.249 30.9 / 0.16);
--indigo:      oklch(0.700 0.090 250);    /* 유지 */
--indigo-soft: oklch(0.700 0.090 250 / 0.16);

--gold:        oklch(0.806 0.136 85);     /* = #E8B84A — GIWA 원색과 동일 */
--gold-soft:   oklch(0.806 0.136 85 / 0.16);
--giwa-red:    oklch(0.637 0.249 30.9);
```

`--paper`를 순수 검정(`oklch(0 0 0)`)으로 하지 않는 이유: POI에는 종이 위에 얹힌 요소
(`--paper-sunk`)가 있어서 완전 검정이면 층이 구분되지 않는다. `0.145`는 GASOK 배경과
눈으로 구별되지 않으면서 층을 만든다.

## 4. 서체

`web/index.html`의 Google Fonts 링크를 교체한다.

```
바꾼다  --font-body:  "IBM Plex Sans KR"  →  "Pretendard Variable", "Pretendard"
유지    --font-display: "Gowun Batang"     ← 증서의 정체성. GIWA에 없는 것이고, 그래서 필요하다
유지    --font-mono:  "IBM Plex Mono"      ← UID·해시용. 바꿀 이유가 없다
```

Pretendard는 Google Fonts에 없다. **CDN을 추가한다.**

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
```

```css
--font-body: "Pretendard Variable", Pretendard, system-ui, sans-serif;
```

기존 Google Fonts 링크에서 `IBM+Plex+Sans+KR`만 빼고 `Gowun Batang`·`IBM Plex Mono`는 남긴다.

> **폰트가 로드되지 않으면 `system-ui`로 떨어진다.** 화면이 깨지지는 않는다.
> 다만 배포 전에 네트워크 탭에서 200을 확인할 것.

## 5. `//` 섹션 라벨

새 클래스를 만들지 않는다. **기존 `<h2>`에 CSS만 붙인다.**

```css
.doc-section > h2::before {
    content: "// " / "";   /* ← 뒤의 / "" 를 빠뜨리지 말 것 */
    color: var(--seal);
    font-family: var(--font-mono);
    font-weight: 500;
}
```

실제 선택자는 현재 `styles.css`의 절 구조에 맞춘다. **DOM은 건드리지 않는다.**

> **`/ ""` 가 이 규칙의 전부다.** 생성 콘텐츠의 **대체 텍스트를 비우는** 문법이다.
> 이게 없으면 Chrome이 `"// "`를 **접근성 이름에 포함시켜** 제목이 `// 커밋`이 되고,
> 스크린리더가 슬래시를 읽으며 E2E의 `exact` heading 조회가 깨진다.
>
> 처음에 "`::before`는 접근성 트리에 안 들어간다"고 적었는데 **틀렸다.**
> 그대로 넣었다가 E2E 26개 중 **11개가 깨졌다.** 시각 효과와 접근성 이름은 별개다.

## 6. 기와 구분선

절과 절 사이 `<hr>` 또는 `.doc-section + .doc-section`의 위쪽 경계에 기와 물결을 옅게 얹는다.
이미지를 쓰지 않고 CSS만으로 만든다.

```css
.doc-section + .doc-section {
    border-top: 1px solid var(--rule);
    position: relative;
}
.doc-section + .doc-section::after {
    content: "";
    position: absolute;
    inset-block-start: -1px;
    inset-inline-start: 0;
    inline-size: 4.5rem;
    block-size: 2px;
    background: var(--seal);
    opacity: 0.55;
}
```

**이것이 서명이다.** 절마다 처마 끝처럼 짧은 인주색 선이 하나씩 얹힌다.
과하면 장식이 되므로 길이 `4.5rem`·불투명도 `0.55`를 넘기지 말 것.

## 7. 금색을 어디에 쓰는가

지금 POI에 없던 색이므로 **쓸 자리를 정해두지 않으면 아무 데나 들어간다.**

| 쓴다 | 쓰지 않는다 |
|---|---|
| `검증 지갑` 배지 배경 (`--gold-soft`) | 인장 7상태 — 상태 색은 이미 정해져 있다 |
| `오프체인 검증` 절의 `MATCH` 표시 | 버튼 — 주 버튼은 `--seal`, 보조는 고스트다 |
| 계보(부모 결정) 연결선 | 본문 텍스트 |

**금색으로 우열을 표현하지 않는다.** §6.3 배지 정책이 디자인에도 적용된다.

## 8. 검증

값만 바꾸므로 기능 테스트가 전부 그대로 통과해야 한다. **하나라도 깨지면 값이 아니라
구조를 건드린 것이다 — 되돌리고 다시 볼 것.**

```bash
cd /Users/bo/GIWA/web && npx tsc --noEmit && npm test && npm run build
bash /Users/bo/GIWA/scripts/dev_up.sh && cd /Users/bo/GIWA/web && npm run test:e2e   # 26/26, skipped 0
```

그리고 눈으로:

```
1. 라이트 모드에서 인장이 여전히 종이 위에 읽히는가
2. 다크 모드 인장을 스포이드로 찍으면 #FF2200인가
3. 절 제목 앞에 `//`가 붙었는가 — 그런데 스크린리더 문구는 그대로인가
4. 대비 — --ink-faint가 --paper 위에서 4.5:1을 넘는가 (양쪽 모드 모두)
```

4번이 실패하면 `--ink-faint` 명도를 올린다. **대비를 포기하고 GIWA 값을 맞추지 말 것.**
