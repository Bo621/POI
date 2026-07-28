# 테스트 전수 실행 기록

> **2026-07-29 01:37 KST, 한 자리에서 연속 실행한 결과다.**
>
> 이 파일이 있는 이유: 앞서 각기 다른 시점에 돌린 숫자를 합쳐 "384개"라고 썼는데,
> 그건 근거가 아니다. 서로 다른 커밋에서 나온 수치를 더한 것이기 때문이다.
> 지금은 같은 커밋에서 다섯 스위트를 연달아 돌린 결과다.

| 스위트 | 결과 | 실행 |
|---|---|---|
| contracts | **150 passed, 0 failed, 0 skipped** | `forge test` (8 suites) |
| core | **62 pass, 0 fail** | `npm test` |
| verifier | **58 pass, 0 fail** | `npm test` |
| web | **87 passed** (16 files) | `npm test` |
| e2e | **27 passed** | `npm run test:e2e` (실제 체인 상대) |
| **합계** | **384** | |

## 이 수치가 뜻하는 것과 뜻하지 않는 것

**뜻하는 것**

- 컨트랙트 불변식이 단위 테스트로 고정돼 있다
- 포크 테스트는 **실제 EAS 바이트코드**를 상대로 돈다 (모의 객체가 아니다)
- E2E는 실제 체인(로컬 anvil)에 시드를 올리고 브라우저로 검증한다
- `commitment` 테스트 벡터를 Solidity와 TS가 **같은 파일**에서 읽는다

**뜻하지 않는 것**

테스트 개수는 품질의 증거가 아니다. 이 저장소에서 실제로 있었던 일:

> **조건 기호 6개가 전부 잘못 표시되는 결함**을, 단위 테스트 80개가 통과하는 동안
> 아무도 잡지 못했다. 배포된 화면을 눈으로 보고서야 발견했다.
> (`op=1`은 `≥`인데 화면에는 `≠`로 나왔다)

그래서 지금은 그 매핑을 `core`의 `OP`에서 **파생**시키고, 기호와 실제 판정을
함께 고정하는 테스트를 넣었다. 뮤테이션으로 그 테스트가 실제로 잡는지도 확인했다.

**개수보다 중요한 것은 "무엇을 잡는가"다.**

## 재현

```bash
cd contracts && forge test
cd core      && npm test
cd verifier  && npm test
cd web       && npm test
bash scripts/dev_up.sh && cd web && npm run test:e2e
```

포크 테스트는 네트워크가 필요하다:

```bash
anvil --fork-url https://sepolia-rpc.giwa.io/ &
GIWA_SEPOLIA_RPC_URL=http://127.0.0.1:8545 FOUNDRY_PROFILE=fork forge test
```
