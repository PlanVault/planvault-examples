#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# End-to-end Runtime API smoke test (curl + jq). Idempotent per run: creates a new session.
# Polls GET /history for plan confirmation; optional approve; closes session via PATCH.
# Newer APIs may persist extra event types (e.g. tool_selection, run_phase); this script only cares about confirm_plan_required / done / error.
set -euo pipefail

: "${PLANVAULT_API_KEY:?Set PLANVAULT_API_KEY (project API key)}"
: "${PLANVAULT_PROJECT_ID:?Set PLANVAULT_PROJECT_ID (must match the project for that API key)}"
BASE="${PLANVAULT_BASE_URL:-https://api.planvault.ai}"
BASE="${BASE%/}"
RT="$BASE/api/v1/projects/$PLANVAULT_PROJECT_ID/sessions"

hdr_auth=(-H "Authorization: Bearer ${PLANVAULT_API_KEY}" -H "Content-Type: application/json")

echo "== POST $RT"
sess_json="$(curl -fsS "${hdr_auth[@]}" -X POST "$RT" \
  -d '{"externalUserId":"bash-e2e-demo","contextVars":{},"tags":["bash-e2e","examples"]}')"
sid="$(echo "$sess_json" | jq -r '.id')"
echo "session=$sid"

echo "== PUT $RT/$sid/secrets"
curl -fsS "${hdr_auth[@]}" -X PUT "$RT/$sid/secrets" \
  -d '{"secrets":{"USER_TOKEN":"test-token-from-bash"}}' -o /dev/null

echo "== POST $RT/$sid/messages (expects HTTP 202 + messageId)"
msg_json="$(curl -fsS "${hdr_auth[@]}" -X POST "$RT/$sid/messages" \
  -d '{"message":"Say hello in one short sentence."}')"
mid="$(echo "$msg_json" | jq -r '.messageId // empty')"
echo "messageId=$mid (correlate with SSE /chat or GET .../history — no per-message status endpoint)"

echo "== Poll history for confirm_plan_required / done / error"
deadline=$((SECONDS + 120))
need_approve=false
while (( SECONDS < deadline )); do
  hist="$(curl -fsS "${hdr_auth[@]}" "$RT/$sid/history")"
  if echo "$hist" | jq -e '.events[]? | select(.eventType=="confirm_plan_required")' >/dev/null 2>&1; then
    need_approve=true
    break
  fi
  if echo "$hist" | jq -e '.events[]? | select(.eventType=="done" or .eventType=="error")' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ "$need_approve" == true ]]; then
  echo "== POST $RT/$sid/actions (approve)"
  curl -fsS "${hdr_auth[@]}" -X POST "$RT/$sid/actions" \
    -d '{"action":"approve"}' -o /dev/null
  while (( SECONDS < deadline )); do
    hist="$(curl -fsS "${hdr_auth[@]}" "$RT/$sid/history")"
    if echo "$hist" | jq -e '.events[]? | select(.eventType=="done" or .eventType=="error")' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

echo "== PATCH $RT/$sid (close)"
curl -fsS "${hdr_auth[@]}" -X PATCH "$RT/$sid" \
  -d '{"status":"closed"}' -o /dev/null

echo "OK"
