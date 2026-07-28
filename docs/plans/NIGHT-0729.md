# 무인 실행 큐 — 2026-07-29 새벽

> 목적: **GIWA 정렬 디자인 적용 + 이미 있는 화면의 진입점 연결.**
> 판단은 [CONCEPT.md](../design/CONCEPT.md)·[TOKENS.md](../design/TOKENS.md)에서 이미 끝났다.
> 밤에는 **값을 옮기고 테스트가 통과하는지 보는 일만** 한다.

## 규칙 — `docs/GOAL.md` 무인 모드에 더해

| | |
|---|---|
| 브랜치 | `feat/giwa-design` 하나에 전부 쌓는다 |
| **main 병합** | **금지.** 프론트 시각 변경은 아침에 사람이 눈으로 보고 판단한다 |
| 항목당 커밋 | 1개. 되돌릴 단위를 작게 유지한다 |
| 3회 실패 | `docs/NIGHT_LOG.md`에 적고 **다음 항목으로.** 밤을 세우지 않는다 |
| 배포 | **하지 않는다.** O3~O8은 사람 승인이 필요하다 |

**하나라도 E2E가 깨지면 그 항목을 되돌린다.** 디자인 변경으로 기능 테스트가 깨졌다면
값이 아니라 구조를 건드린 것이다. 테스트를 고치지 말고 **변경을 고친다.**

## 큐

### N1 — 색 토큰 교체

`web/src/styles.css`의 `:root`와 `@media (prefers-color-scheme: dark)` 블록.
[TOKENS.md §2·§3](../design/TOKENS.md)의 값을 **그대로** 넣는다.

- 토큰 **이름**을 바꾸지 않는다. 값만 바꾼다
- 신규 토큰 `--gold` · `--gold-soft` · `--giwa-red`를 양쪽 블록에 추가한다
- 아직 아무 데도 쓰지 않는다 (N5에서 쓴다)

검증: `npm run build` · `npm test` · E2E 26/26

### N2 — Pretendard 도입

[TOKENS.md §4](../design/TOKENS.md).

- `web/index.html`에 jsDelivr CDN `<link>` 2줄 추가
- 기존 Google Fonts URL에서 `IBM+Plex+Sans+KR:wght@400;500;600&` 만 제거.
  `Gowun+Batang`·`IBM+Plex+Mono`는 남긴다
- `--font-body` 교체

검증: 위와 동일 + `npm run build` 후 `dist/index.html`에 CDN 링크가 있는지

### N3 — `//` 섹션 라벨

[TOKENS.md §5](../design/TOKENS.md). **CSS `::before`만.** JSX를 건드리지 않는다.

현재 `styles.css`의 절 제목 선택자를 찾아 거기에 붙인다.
`.doc-header > h1`에는 **붙이지 않는다** — 문서 제목은 조항이 아니다.

검증: E2E 26/26 (`::before`는 접근성 트리에 없으므로 `heading` 조회가 그대로여야 한다.
**하나라도 깨지면 선택자를 잘못 잡은 것이다**)

### N4 — 기와 구분선

[TOKENS.md §6](../design/TOKENS.md)의 CSS를 그대로. 길이·불투명도를 늘리지 말 것.

검증: 빌드 + E2E

### N5 — 금색을 쓸 자리에 적용

[TOKENS.md §7](../design/TOKENS.md)의 "쓴다" 세 곳에만.

1. `검증 지갑` 배지 배경 → `--gold-soft`
2. `오프체인 검증` 절의 일치 표시 → `--gold`
3. 계보(부모 결정) 연결선 → `--gold`

**"쓰지 않는다" 목록을 어기지 말 것.** 인장 7상태 색은 그대로다.

검증: 빌드 + E2E + `--gold`가 위 세 곳 외에 등장하지 않는지 `grep`

### N6 — Passport 진입점 연결 ★ 기능

**`web/src/passport.tsx`는 이미 있고 E2E도 있다. 그런데 화면 어디에도 링크가 없어서
URL을 직접 쳐야만 도달한다.** 만들지 말고 **연결만** 한다.

세 자리에 링크를 넣는다.

| 자리 | 링크 |
|---|---|
| `decisionDetail`의 attester 주소 | `#/passport/<attester>` — **가장 중요하다.** 결정을 보다가 그 사람의 다른 판단으로 넘어가는 길이 Decision Graph의 요점이다 |
| `nav`의 연결된 주소 | `#/passport/<내 주소>` |
| `이의` 목록의 이의자 주소 | `#/passport/<이의자>` |

- 링크 문구는 주소 축약형 그대로 둔다. `프로필 보기` 같은 문구를 새로 만들지 않는다
- `routeToHash({name:"passport", address})`를 쓴다. 문자열을 직접 조립하지 않는다
- 주소 비교·표시는 **반드시 소문자로.** 이 저장소에서 세 번 재발한 버그다

E2E를 **1개 추가**한다: 상세에서 attester를 눌러 `#/passport/…`로 이동하고
목록이 뜨는 것까지. (`web/e2e/read.spec.ts`에 이어 붙인다)

검증: E2E 27/27

### N7 — 시각 회귀 기록

`scripts/`에 스크립트를 만들지 말 것. 대신 아침에 사람이 볼 수 있게
`docs/NIGHT_LOG.md`에 **각 항목이 어떤 파일의 몇 줄을 바꿨는지** 한 줄씩 남긴다.

## 하지 말 것

| 금지 | 이유 |
|---|---|
| main 병합 | 시각 변경은 사람이 봐야 한다 |
| 배포·파우셋·공개 테스트넷 트랜잭션 | 되돌릴 수 없다 |
| DOM 구조·화면 문구 변경 | E2E 26개가 문구로 요소를 찾는다 |
| 토큰 **이름** 변경 | 값만 바꾸면 한 곳으로 끝난다 |
| 테스트를 고쳐서 통과시키기 | 깨졌으면 변경이 틀린 것이다 |
| `docs/POI_v0.10.md`·`POI_TechSpec_v3.md`·`docs/metrics/*` 수정 | 원본 문서 |
| 새 화면·새 라우트 추가 | N6은 **연결**이지 신규가 아니다 |
| giwaSans 사용 | 남의 브랜드 전용 서체다 |

## 아침에 사람이 확인할 것

```
1. 라이트 모드에서 인장이 종이 위에 읽히는가
2. 다크 모드 인장이 #FF2200인가 (스포이드)
3. 대비 — --ink-faint가 --paper 위에서 4.5:1 이상인가 (두 모드 모두)
4. `//` 라벨이 과하지 않은가
5. 기와 구분선이 장식으로 보이지 않는가
6. 상세 → passport 이동이 자연스러운가
```

3번이 실패하면 **GIWA 값이 아니라 대비를 지킨다.**

## 전체 검증 명령

```bash
cd /Users/bo/GIWA/web && npx tsc --noEmit && npm test && npm run build
bash /Users/bo/GIWA/scripts/dev_up.sh && cd /Users/bo/GIWA/web && npm run test:e2e
```

기대: `web 80/80` · `e2e 27/27 (skipped 0)` · 빌드 성공
