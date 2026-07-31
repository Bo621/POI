# POI — Proof of Insight

**투자 판단을 결과가 나오기 전에 고정하고, 누구나 나중에 검증한다.**

GASOK 2차 제출 · **GIWA-Native** 트랙 · 2026-07

## 10분에 훑는 경로

처음 오셨다면 이 순서를 권합니다.

| | 문서 | 무엇에 답하나 |
|---|---|---|
| 1 | [무엇을 하는 제품인가](intro/what.md) · [판단은 남지 않는다](problem/no-record.md) | 무슨 문제인가 |
| 2 | [시장과 규제](problem/market.md) | 그 문제가 실재하는가 |
| 3 | [누가 쓰는가](problem/who.md) | 누가 왜 쓰는가 |
| 4 | [신뢰 경계](problem/trust-boundary.md) · [무엇이 증명되나](problem/what-is-proven.md) | **무엇을 보장하고 무엇을 안 하는가** |
| 5 | [배포 상태표](limits/status.md) · [화면](usage/screens.md) | 지금 실제로 되는 것 |
| 6 | [5분 만에 직접 확인하기](intro/verify-in-5-min.md) | 직접 재현해 보기 |
| 7 | [비용](giwa/cost.md) · [다른 체인은 왜 아닌가](giwa/why-not-elsewhere.md) | 왜 GIWA 인가 |
| 8 | [로드맵](limits/roadmap.md) · [팀](team.md) | 앞으로 5개월과 누가 하는가 |
| 9 | [하지 못한 것](limits/not-yet.md) | 안 되는 것 |

모르는 말이 나오면 [용어집](appendix/glossary.md)에 한 줄씩 풀어 두었습니다.

## 한 문단

투자에서 남는 건 거래 기록이 아니라 **판단**입니다. 그런데 판단은 아무 데도 남지 않고,
결과를 본 뒤에 "나는 그럴 줄 알았다"고 말하는 것을 막을 방법이 없습니다.

POI는 결정을 **결과를 알기 전에** 온체인에 고정합니다. 그리고 그 결정이 맞았는지를
발행자가 주장하는 것이 아니라 **컨트랙트가 관측값으로 계산해 강제합니다.**
제3자는 같은 절차를 재현해 독립적으로 확인하거나, 온체인에 이의를 남길 수 있습니다.

## 실제 화면

![기한초과 인장이 찍힌 결정 상세 화면. 발행자와 도장 검증 표시, 커밋 시각, 커밋 당시 선언한 지표·조건·관측 구간이 보인다.](assets/screen-overdue.png)

**결과를 올리지 않은 판단은 「기한초과」로 남습니다.** 미발행을 숨기지 않는 것이
이 제품의 태도입니다. 화면 구조 전체는 [화면](usage/screens.md)에 있습니다.

## 지금 살아 있는 것

GIWA Sepolia(`91342`)에 배포돼 있고, 이 문서의 주장은 직접 확인할 수 있습니다.

| | |
|---|---|
| 컨트랙트 | 리졸버 4종 — 익스플로러에서 소스 검증됨 |
| 스키마 | EAS 스키마 4종 (note · decision · settlement · challenge) |
| 지표 | 2종 등록, 정의 문서 해시로 고정(frozen) |
| 화면 (공개 URL) | [https://poi-static-production.up.railway.app](https://poi-static-production.up.railway.app)<br> 커밋 → 결과 등록 → 이의 → 공개 검증 전 경로. 테스트넷에 등록완료·철회 이력·기한초과 fixture 가 있다 |
| 오프체인 검증기 | `poi-verify` · `poi-reveal` CLI |

## 하지 않는 것

성과 랭킹 · 리더보드 · 수익률 공개 · 카피트레이딩 · 종목 추천 · 자동매매 ·
투자금 모집 · 판단 품질 점수.

**"누가 더 잘하는가"가 아니라 "이 판단이 언제 있었고 무엇을 말했는가"만 다룹니다.**
