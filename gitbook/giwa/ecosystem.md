# 생태계 편입

POI의 앵커는 새 레지스트리가 아니라 EAS `SchemaResolver`입니다.

| 담당 | 주체 |
|---|---|
| attestation 레지스트리, 발급·조회·철회 | EAS — 재구현하지 않음 |
| 스키마별 불변식 강제 | POI Resolver — EAS가 발행 직전 호출 |
| 정산 재현 | 오프체인 verifier — 버전 기록 |

EAS 표준을 쓰므로 POI attestation은 EAS 지원 도구에서 조회할 수 있습니다.
도장(Dojang)의 Verified Address는 신원 결속에 사용합니다. Verified Balance와
Upbit Oracle은 MVP에 포함하지 않으며 Phase 2 이후의 대상입니다.
