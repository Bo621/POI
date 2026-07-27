#!/usr/bin/env python3
"""X1 commitment 테스트 벡터 생성.

기대값은 TS 구현이 아니라 cast keccak(Foundry)으로 만든다.
TS·Solidity 양쪽이 이 값을 '재현'해야 한다 — 자기검증 순환 방지.

C = keccak256( TAG(32) ‖ chainId(uint256 BE, 32) ‖ attester(20) ‖ salt(16) ‖ utf8(JCS(payload)) )
"""
import json, subprocess, collections

def cast_keccak(hexstr: str) -> str:
    return subprocess.run(["cast", "keccak", hexstr], capture_output=True, text=True,
                          check=True).stdout.strip()

def cast_keccak_str(s: str) -> str:
    return cast_keccak("0x" + s.encode("utf-8").hex())

def jcs(obj) -> str:
    """RFC 8785 부분집합. 벡터 payload는 ASCII 제어문자·지수표기 없는 값만 쓴다.
    (전체 구현은 core/src/jcs.ts — 여기서는 기대값 생성용 최소 구현)"""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

TAGS = collections.OrderedDict(
    (name, {"preimage": pre, "tag": cast_keccak_str(pre)})
    for name, pre in [
        ("DECISION", "poi.commit.decision.v1"),
        ("TRIGGER",  "poi.commit.trigger.v1"),
        ("EVIDENCE", "poi.commit.evidence.v1"),
        ("REASON",   "poi.commit.reason.v1"),
        ("NOTE",     "poi.commit.note.v1"),
    ]
)

GIWA = 91342
ALICE = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
BOB   = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
SALT_A = "0x000102030405060708090a0b0c0d0e0f"
SALT_B = "0xfedcba98765432100123456789abcdef"

def commitment(tag, chain_id, attester, salt, payload):
    canon = jcs(payload)
    preimage = (
        tag[2:]
        + f"{chain_id:064x}"
        + attester[2:]
        + salt[2:]
        + canon.encode("utf-8").hex()
    )
    return canon, "0x" + preimage, cast_keccak("0x" + preimage)

CASES = [
    ("decision_ko",      "DECISION", GIWA, ALICE, SALT_A,
     {"decision": "BTC 비중을 40%에서 25%로 줄인다", "committedAt": "2026-07-27T12:00:00Z"},
     "한글 UTF-8 + 키 정렬(committedAt < decision)"),
    ("trigger_ko",       "TRIGGER",  GIWA, ALICE, SALT_A,
     {"trigger": "30일 실현변동성 60% 초과"},
     "단일 키"),
    ("note_mixed_types", "NOTE",     GIWA, ALICE, SALT_B,
     {"b": True, "n": 1.5, "arr": [3, 1, 2], "o": {"z": 1, "a": 2}, "s": "x"},
     "불리언·숫자·배열(순서 보존)·중첩 객체(키 정렬)"),
    ("evidence_empty",   "EVIDENCE", GIWA, ALICE, SALT_A,
     {},
     "빈 객체 — commitment는 0이 아니어야 한다"),
    ("decision_bob",     "DECISION", GIWA, BOB,   SALT_A,
     {"decision": "BTC 비중을 40%에서 25%로 줄인다", "committedAt": "2026-07-27T12:00:00Z"},
     "★ attester만 다름 — decision_ko와 달라야 한다 (B3 복사 공격 차단)"),
    ("decision_chain1",  "DECISION", 1,    ALICE, SALT_A,
     {"decision": "BTC 비중을 40%에서 25%로 줄인다", "committedAt": "2026-07-27T12:00:00Z"},
     "★ chainId만 다름 — decision_ko와 달라야 한다 (체인 간 재사용 차단)"),
]

out = {
    "version": "poi.commitment.vectors.v1",
    "formula": "keccak256(TAG(32) || chainId(uint256 BE,32) || attester(20) || salt(16) || utf8(JCS(payload)))",
    "spec": "POI_TechSpec_v3.md §4.3 / E1",
    "note": "기대값은 cast keccak(Foundry)으로 생성. TS·Solidity가 각각 재현해야 한다.",
    "caseCount": len(CASES),   # Solidity 테스트용 — forge의 JSON 경로는 [*] 집계를 지원하지 않는다
    "tags": TAGS,
    "cases": [],
}

for name, tag_name, chain_id, attester, salt, payload, desc in CASES:
    canon, preimage, c = commitment(TAGS[tag_name]["tag"], chain_id, attester, salt, payload)
    out["cases"].append({
        "name": name,
        "description": desc,
        "tagName": tag_name,
        "tag": TAGS[tag_name]["tag"],
        "chainId": chain_id,
        "attester": attester,
        "salt": salt,
        "payload": payload,
        "jcs": canon,
        "preimage": preimage,
        "commitment": c,
    })

import os
path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core", "vectors", "commitment.v1.json")
open(path, "w").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")

for c in out["cases"]:
    print(f'{c["name"]:18} {c["commitment"]}')
assert out["cases"][0]["commitment"] != out["cases"][4]["commitment"], "attester 결속 실패"
assert out["cases"][0]["commitment"] != out["cases"][5]["commitment"], "chainId 결속 실패"
print("\n★ attester/chainId 결속 확인 통과")
