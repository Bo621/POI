# 로컬 수동 테스트 시나리오

각 절은 기대 화면과 실패 시 확인할 지점을 함께 적는다. UID와 관측값은
`docs/fixtures/seed.json`을 기준으로 한다.

## S0. 시드 시작

`bash scripts/dev_up.sh`를 실행한다. 출력에 F1, F2, F4, F5,
f_copy UID와 verifier 명령이 있어야 한다. MetaMask에 `http://127.0.0.1:8545`,
chainId `91342`를 추가한다.

이 시드는 로컬에 배포한 EAS(lib v1.4.0)를 쓴다. 실제 배포본(1.4.1-beta.3) 상대 검증은
`FOUNDRY_PROFILE=fork forge test`가 담당한다.

- 기대 화면: 스크립트가 네 fixture의 기대 상태와 UID를 출력한다.
- 어긋나면: anvil 로그 경로와 실패한 phase의 Foundry 출력을 확인한다. 관측 실패라면
  과거 1분봉을 얻지 못한 것이므로 임의 관측값으로 계속하지 않는다.

## S1. 배포 인식

`web/.env.local`을 잠시 다른 이름으로 옮겨 웹을 열고, 다시 복원한 뒤 재시작한다.

- 기대 화면: 환경 파일이 없을 때 발행 UI가 비활성화되고, 복원하면 배포를 인식한다.
- 어긋나면: 스키마 UID 4종과 resolver 주소 4종이 모두 들어 있는지 확인한다.

## S2. 지갑 A

anvil 기본 계정 A를 연결하고 임의의 시드 UID를 조회한다.

- 기대 화면: 미검증 배지와 검증 UID 미해결 안내가 함께 보인다.
- 어긋나면: 계정이 A인지, 로컬 RPC에 연결됐는지, Dojang 조회 실패가 검증 성공으로
  잘못 표시되지 않았는지 확인한다.

## S3. 상태 인장 4종

`seed.json`의 F1, F2, F4, F5 decisionUID를 차례로 조회한다.

- 기대 화면: F1 `정산완료`, F2 `정산완료`와 `정산 철회 이력 있음`, F4 `기한초과`,
  F5 `대기`.
- 어긋나면: 브라우저 시간이 아니라 체인 시간이 쓰이는지, active head와 revoke count,
  최종 블록 시간이 fixture 관측 구간을 지난 시각인지 확인한다.

## S4. F5 시간 경계

F5의 `windowStart` 직전에서 시작해 현재 체인 시각과 목표의 차이를 구하고
`cast rpc evm_increaseTime <delta>`와 `cast rpc evm_mine`으로
`t=windowStart`, `t=W`, `t=W+G` 경계를 각각 만든다.
여기서 W는 `windowEnd`, G는 `graceSeconds`다.

- 기대 화면: `대기` → `관측중` → `정산대기` → `기한초과`로 바뀌고, 15초 이내에
  체인 시간으로 재동기화된다.
- 어긋나면: W가 windowEnd인지, grace가 3600초인지 확인한다.

## S5. 이의 목록

이의 목록을 빈 조건과 F1 정산 조건에서 각각 조회한다.

- 기대 화면: 빈 경우 건수 없음, 결과에는 임의 정렬 주장이 없고 검증 지갑 상태가 병기되며
  `조회된 것이 전부라는 보장은 없습니다` 안내가 보인다.
- 어긋나면: EAS challenge 스키마 필터와 조회 시작 블록을 확인한다.

## S6. 사전 검증과 salt 백업

결정 폼에서 필수 입력, UID 형식, window 순서, grace 범위, metric/op를 각각 잘못 넣고
제출을 시도한 뒤 정상 입력으로 salt 백업 전후를 비교한다.

- 기대 화면: 사전 검증 5종이 제출 전에 막고, salt 백업을 완료하기 전에는 커밋할 수 없다.
- 어긋나면: 폼 검증과 `SaltBackupGate` 상태가 실제 제출 버튼에 연결됐는지 확인한다.

## S7. 한국어 컨트랙트 오류

계정 C로 F1을 정산하고, A로 활성 정산을 supersedes로 다시 정산하고, B로 F1 정산에
두 번째 이의를 발행한다.

- 기대 화면: 각각 `NotDecisionOwner`, `PriorStillActive`, `AlreadyChallenged`에 대응하는
  한국어 오류가 보인다.
- `NotDecisionOwner` 컨트랙트 revert 문구는 UI 소유자 사전 검증을 우회해야 볼 수 있으므로 자동 검사 대상이 아니다.
- 어긋나면: 지갑이 의도한 A/B/C인지, 오류 selector 매핑이 누락되지 않았는지 확인한다.

## S8. CT18 복사 공격

`seed.json`의 `f1Reveal` salt/payload로 F1과 f_copy를 각각 공개 대조한다.

- 기대 화면: F1은 성공하고 f_copy는 실패한다. 두 결정의 `decisionCommitment` 바이트는
  동일하지만 F1 attester는 A, f_copy attester는 B다.
- 어긋나면: commitment 프리이미지에 조회한 attester와 chainId 91342가 포함되는지 확인한다.

## S9. 성공 경로 1회

A로 저널 작성 → 노트 승격 → salt 백업 → 결정 커밋을 수행한다. windowEnd로 시간을
옮겨 정산하고, B로 이의를 발행한 뒤 A의 커밋을 reveal한다.

- 기대 화면: 각 UID가 이전 단계와 연결되고, 정산은 활성 head, B의 이의는 목록에 나타나며,
  reveal은 커밋과 일치한다.
- 어긋나면: note promotion의 동일 attester, refUID, windowEnd, settlement owner,
  challenge settlementUID를 순서대로 확인한다.

## S10. verifier

요약에 출력된 명령 또는 다음 형식으로 실행한다.

```bash
poi-verify <f1.decisionUID> --rpc http://127.0.0.1:8545 --json
```

- 기대 화면: 로컬 시드는 UI 확인용이므로 verifier의 실제 `MATCH` 증명은 실제 배포 뒤에
  수행한다. F2 상태를 조회하면 철회된 S1이 아니라 활성 S2를 사용한다.
- 어긋나면: provider 관측 구간, metric definition hash, active settlement head가
  `seed.json`과 같은지 확인한다.

종료할 때 `bash scripts/dev_down.sh`를 실행한다.
