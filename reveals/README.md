# POI reveal 파일

공개 파일은 `<attestationUID>.<tag>.json` 이름의 JSON이며 `version`은
`poi.reveal.v1`입니다.

- `chainId`: commitment가 만들어진 체인 ID
- `attester`: 원래 attestation 발행자 주소
- `attestationUID`: 공개 대상 attestation UID
- `tag`: `DECISION`, `TRIGGER`, `EVIDENCE`, `REASON`, `NOTE` 중 하나
- `salt`: commitment 생성에 사용한 16바이트 salt
- `payload`: JCS 정규화 전에 입력한 원본 JSON 값

verifier의 reveal CLI(V4)는 아직 없습니다. 현재는 웹 UI에서 파일의 salt와 payload로
commitment를 다시 계산해 온체인 값과 대조합니다.

salt를 잃으면 commitment의 내용을 영구히 공개할 수 없습니다. 공개는 선택 사항이며,
공개 여부는 정산 결과에 영향을 주지 않습니다.
