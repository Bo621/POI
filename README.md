# Proof of Investing (POI)

GIWA 기반 투자 의사결정 검증 인프라. 결정을 결과 이전에 고정하고, 선언한 조건을 재현 가능한 방식으로 정산한다.

## 기준 문서

| 문서 | 경로 |
|---|---|
| 기획서 (최신 v0.10) | [`docs/POI_v0.10.md`](docs/POI_v0.10.md) |
| 기술 명세 (최신 v3.0) | [`docs/POI_TechSpec_v3.md`](docs/POI_TechSpec_v3.md) |

이전 버전(v0.4~v0.9, TechSpec v2)은 이력 참고용으로 `docs/`에 함께 둔다.

## 구조

```
contracts/   Foundry — EAS 스키마 리졸버 (POINote·Decision·Settlement·Challenge)
web/         프론트엔드 — 지갑 연결, 3계층 등록, 정산·이의, DAG 조회
verifier/    오프체인 verifier v1.0 (E2·E4·E5) + metric 정의 문서
docs/        기획서·기술명세
```

## 체인

GIWA Sepolia — chainId **91342**, RPC `https://sepolia-rpc.giwa.io/`.
EAS `0x4200…0021`, SchemaRegistry `0x4200…0020`, DojangScroll `0xd5077b…7B9` (전부 프록시 — 구현 주소 하드코딩 금지).

## 구현 진행

```
/goal C4     백로그 항목 하나를 구현 → 테스트 → codex 리뷰 게이트 → 병합까지
/goal        다음 P0 항목 자동 선택
```

| 파일 | 역할 |
|---|---|
| [`docs/GOAL.md`](docs/GOAL.md) | 실행 방식 — 루프, 토큰 규칙, 명세 절 인덱스, 고정된 결정 |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | 상태 — 항목별 완료 조건과 진행 |
| [`docs/PLAN.md`](docs/PLAN.md) | 순서 — 게이트, 일정, 리스크 |

리뷰 게이트: 각 항목은 `codex review`가 `[P1]` 0건이어야 완료 처리한다.

## 설정

```bash
cp .env.example .env          # DEPLOYER_PRIVATE_KEY 채우기 (커밋 금지)
git submodule update --init --recursive
cd contracts && forge build
```
