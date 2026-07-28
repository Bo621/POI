# E2E가 보장하는 행위

`npm run test:e2e`는 아래 16개 행위를 검증한다. 시드가 없거나 테스트가 하나라도
skip되면 명령은 실패한다.

| # | 파일 | 보장하는 행위 |
|---|---|---|
| 1 | `read.spec.ts` | 배포 완료 환경에서 F1 결정의 상태가 정산 완료로 표시된다. |
| 2 | `read.spec.ts` | F4 결정의 상태가 기한 초과로 표시된다. |
| 3 | `read.spec.ts` | F2 결정은 정산 완료이며 정산 철회 이력이 표시된다. |
| 4 | `read.spec.ts` | F5 결정의 인장이 다음 시간 경계에서 새로고침 없이 바뀐다. |
| 5 | `read.spec.ts` | F1 정산의 이의 한 항목을 표시하고, 건수나 조회 완전성을 잘못 보장하지 않는다. |
| 6 | `read.spec.ts` | F1 공개 데이터의 commitment가 일치하면 RevealFile을 다운로드할 수 있다. |
| 7 | `read.spec.ts` | 사본의 commitment가 불일치하면 실제 attester를 표시하고 RevealFile 다운로드를 막는다. |
| 8 | `read.spec.ts` | 결정 DAG가 부모 노드와 조회 완전성 한계 안내를 표시한다. |
| 9 | `read.spec.ts` | Strategy Passport가 주소의 기록 목록과 비순위 안내를 표시한다. |
| 10 | `write.spec.ts` | 지갑을 연결하면 연결 주소를 축약해 표시한다. |
| 11 | `write.spec.ts` | 저널을 저장하면 로컬 저널 목록에 나타난다. |
| 12 | `write.spec.ts` | 결정은 salt 백업 확인 전 발행을 막고, 확인 후 발행되어 상태 조회가 가능하다. |
| 13 | `write.spec.ts` | 과거의 관측 시작 시각은 한국어 오류와 함께 결정 발행을 막는다. |
| 14 | `write.spec.ts` | 30분 유예 기간은 한국어 오류와 함께 결정 발행을 막는다. |
| 15 | `write.spec.ts` | 결정 소유자가 아닌 계정의 정산을 한국어 오류와 함께 막는다. |
| 16 | `fullpath.spec.ts` | 저널 저장·노트 승격·결정 발행·시간 경과·정산·이의·공개 파일 다운로드의 전체 성공 경로가 완주된다. |

## 현재 테스트 대응표

| 행위 # | 현재 테스트 |
|---|---|
| 1 | `read.spec.ts` — `배포 안내가 없고 F1은 정산완료다` |
| 2 | `read.spec.ts` — `F4는 기한초과다` |
| 3 | `read.spec.ts` — `F2는 정산완료이며 철회 이력이 있다` |
| 4 | `read.spec.ts` — `F5는 다음 시간 경계에서 새로고침 없이 인장이 바뀐다` |
| 5 | `read.spec.ts` — `이의 목록은 한 항목이며 건수 표현과 완전성 보장이 없다` |
| 6 | `read.spec.ts` — `Reveal commitment 대조` / `F1은 일치한다` |
| 7 | `read.spec.ts` — `Reveal commitment 대조` / `CT18 사본은 불일치하고 다운로드할 수 없다` |
| 8 | `read.spec.ts` — `DAG에 노드와 조회 완전성 안내가 나온다` |
| 9 | `read.spec.ts` — `Passport에 목록과 비순위 안내가 나온다` |
| 10 | `write.spec.ts` — `지갑 연결 주소가 축약 표기된다` |
| 11 | `write.spec.ts` — `저널 저장은 로컬 목록에 나타난다` |
| 12 | `write.spec.ts` — `결정 커밋은 백업 확인 뒤 발행되고 상태 조회가 된다` |
| 13 | `write.spec.ts` — `과거 windowStart는 한국어 오류로 발행을 막는다` |
| 14 | `write.spec.ts` — `30분 graceSeconds는 한국어 오류로 발행을 막는다` |
| 15 | `write.spec.ts` — `B 계정의 F1 정산 시도는 한국어 소유자 오류를 표시한다` |
| 16 | `fullpath.spec.ts` — `저널부터 reveal 다운로드까지 전체 성공 경로를 완주한다` |

---

## 실행 전에 시드를 새로 만든다

E2E는 단일 체인을 공유하므로 직렬로 실행한다. 시간에 의존하는 단언은 체인 시각에서 계산한다.

`fullpath`가 `evm_increaseTime`으로 체인 시각을 민다. 그래서 **한 시드로 E2E를 여러 번
돌리면 fixture의 기대 상태가 어긋나** 거짓 실패가 난다(F5가 `대기`에서 `관측중`으로 넘어가는 식).

```
bash scripts/dev_up.sh && cd web && npm run test:e2e
```

연속 4회 실행에서 26/26이 유지되는 것은 확인했지만, **깨끗한 판정이 필요하면 시드를 새로 만든다.**
