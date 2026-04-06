# Python (confluent-kafka + requests) worker

HMAC helpers live in [`signing.py`](signing.py) (covered by `tests/test_signing.py`). **License:** [Apache-2.0](../../../LICENSE).

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PLANVAULT_BASE_URL=https://api.planvault.ai
export PLANVAULT_ORG_ID=...
export PLANVAULT_TRIGGER_KEY=...
export PLANVAULT_WEBHOOK_SECRET=...
export KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:19092
python worker.py
```

The consumer parses each message as JSON and re-serializes with `json.dumps(..., separators=(",", ":"))` so the POST body matches PlanVault’s HMAC over canonical JSON.

If the Kafka value is **not** valid JSON, the raw string bytes are used as the body (still signed); ensure triggers use valid JSON in production.
