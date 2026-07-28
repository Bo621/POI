# 커밋 → 결과 등록 → 이의 → 공개

```mermaid
sequenceDiagram
    autonumber
    actor A as 결정 소유자
    participant EAS as EAS
    participant R as POI 리졸버
    actor B as 제3자

    Note over A: t0 — 결과를 알기 전
    A->>EAS: 결정 커밋 (C = 해시, 관측 구간, 예상 결과)
    EAS->>R: onAttest
    R-->>EAS: windowStart >= now 확인 (I4)
    Note over EAS: 결정은 철회 불가

    Note over A,B: 관측 구간 진행 …

    Note over A: t1 — 구간 종료 후
    A->>EAS: 결과 등록 (관측값 + 출처만)
    EAS->>R: onAttest
    R-->>EAS: result 를 재계산해 대조 (I17)

    B->>EAS: 이의 (관측값이 다르다)
    B->>B: 오프체인 재현 — poi-verify
    A->>B: 공개 (salt, 원문) → 누구나 C 재계산
```


```
t0   COMMIT     salt ← CSPRNG(128)
                C = H(TAG ‖ chainId ‖ attester ‖ salt ‖ JCS(payload))
                온체인: C + outcome predicate + window

t1   SETTLE     소유자 발행. 온체인이 결과 판정을 검증

t1+  CHALLENGE  관측값·출처에 대한 이의 (누구나)

t1+  REVEAL     (salt, payload) 공개 → 누구나 C 재계산 (선택)
```

결정 커밋은 철회할 수 없습니다. 결과 등록은 결정 소유자가 발행하며, 관측값과
모순되는 `result`는 컨트랙트가 거부합니다. 다른 지갑은 활성 결과 등록에 이의를
발행할 수 있습니다. 공개는 정산의 전제가 아니라 선택 사항입니다.
