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

# Stable id for this run (PlanVault accepts [a-zA-Z0-9._~-]{1,128}); echoed in X-Request-Id on every response.
if command -v openssl >/dev/null 2>&1; then
  PV_REQ_ID="bash-e2e-$(openssl rand -hex 16)"
else
  PV_REQ_ID="bash-e2e-${RANDOM}-$$"
fi
hdr_auth=(
  -H "Authorization: Bearer ${PLANVAULT_API_KEY}"
  -H "Content-Type: application/json"
  -H "X-Request-Id: ${PV_REQ_ID}"
)
echo "Using X-Request-Id=${PV_REQ_ID} (logs / support correlation)"

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

echo "== Poll history for confirm_plan_required / awaiting_signal / done / error"
deadline=$((SECONDS + 120))
need_approve=false
need_signal=false
signal_token_id=""
while (( SECONDS < deadline )); do
  hist="$(curl -fsS "${hdr_auth[@]}" "$RT/$sid/history")"
  if echo "$hist" | jq -e '.events[]? | select(.eventType=="confirm_plan_required")' >/dev/null 2>&1; then
    need_approve=true
    break
  fi
  if echo "$hist" | jq -e '.events[]? | select(.eventType=="awaiting_signal")' >/dev/null 2>&1; then
    need_signal=true
    signal_token_id="$(echo "$hist" | jq -r \
      '.events[]? | select(.eventType=="awaiting_signal") | (.tokenId // .payload.tokenId) // empty' \
      | head -1)"
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

if [[ "$need_signal" == true ]]; then
  if [[ -n "${PLANVAULT_SIGNAL_SECRET:-}" && -n "$signal_token_id" ]]; then
    echo "== POST $BASE/api/v1/projects/$PLANVAULT_PROJECT_ID/callbacks/$signal_token_id (wait_for_signal delivery)"
    curl -fsS \
      -H "Authorization: Bearer ${signal_token_id}:${PLANVAULT_SIGNAL_SECRET}" \
      -H "Content-Type: application/json" \
      -H "X-Request-Id: ${PV_REQ_ID}" \
      -X POST "$BASE/api/v1/projects/$PLANVAULT_PROJECT_ID/callbacks/$signal_token_id" \
      -d '{"source":"bash-e2e-demo"}' -o /dev/null
    echo "(signal delivered; waiting for done or error)"
    while (( SECONDS < deadline )); do
      hist="$(curl -fsS "${hdr_auth[@]}" "$RT/$sid/history")"
      if echo "$hist" | jq -e '.events[]? | select(.eventType=="done" or .eventType=="error")' >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  else
    echo "(awaiting_signal detected; set PLANVAULT_SIGNAL_SECRET to auto-deliver the callback)"
    echo "  tokenId=${signal_token_id:-unknown}"
    echo "  curl -X POST \$BASE/api/v1/projects/\$PLANVAULT_PROJECT_ID/callbacks/\$TOKEN_ID \\"
    echo "    -H 'Authorization: Bearer \$TOKEN_ID:\$SECRET' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"result\":\"ok\"}'"
  fi
fi

echo "== PATCH $RT/$sid (close)"
curl -fsS "${hdr_auth[@]}" -X PATCH "$RT/$sid" \
  -d '{"status":"closed"}' -o /dev/null

echo "OK"
