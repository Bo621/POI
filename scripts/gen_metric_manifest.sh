#!/usr/bin/env bash
set -euo pipefail

price_name="BTC_PRICE_KRW_AT_END"
price_doc="docs/metrics/BTC_PRICE_KRW_AT_END.md"
drawdown_name="BTC_MAX_DRAWDOWN_IN_WINDOW"
drawdown_doc="docs/metrics/BTC_MAX_DRAWDOWN_IN_WINDOW.md"
hl_name="HL_PERP_OPEN_LONG_QTY"
hl_doc="docs/metrics/HL_PERP_OPEN_LONG_QTY.md"

price_metric_id="$(cast keccak "$price_name")"
price_definition_hash="$(cast keccak "0x$(xxd -p -c 999999 <"$price_doc" | tr -d '\n')")"
drawdown_metric_id="$(cast keccak "$drawdown_name")"
drawdown_definition_hash="$(cast keccak "0x$(xxd -p -c 999999 <"$drawdown_doc" | tr -d '\n')")"
hl_metric_id="$(cast keccak "$hl_name")"
hl_definition_hash="$(cast keccak "0x$(xxd -p -c 999999 <"$hl_doc" | tr -d '\n')")"

{
  printf '{\n'
  printf '  "version": "poi.metrics.v1",\n'
  printf '  "generatedBy": "scripts/gen_metric_manifest.sh (cast keccak)",\n'
  printf '  "metrics": [\n'
  printf '    {\n'
  printf '      "name": "%s",\n' "$price_name"
  printf '      "metricId": "%s",\n' "$price_metric_id"
  printf '      "doc": "%s",\n' "$price_doc"
  printf '      "definitionHash": "%s",\n' "$price_definition_hash"
  printf '      "decimals": 0,\n'
  printf '      "kind": 0,\n'
  printf '      "unit": "krw"\n'
  printf '    },\n'
  printf '    {\n'
  printf '      "name": "%s",\n' "$drawdown_name"
  printf '      "metricId": "%s",\n' "$drawdown_metric_id"
  printf '      "doc": "%s",\n' "$drawdown_doc"
  printf '      "definitionHash": "%s",\n' "$drawdown_definition_hash"
  printf '      "decimals": 1,\n'
  printf '      "kind": 0,\n'
  printf '      "unit": "percent"\n'
  printf '    }\n'
  printf '  ]\n'
  printf '}\n'
} >docs/metrics/manifest.json
