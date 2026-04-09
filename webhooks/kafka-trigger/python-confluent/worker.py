# SPDX-License-Identifier: Apache-2.0
"""Kafka consumer: forward payloads to PlanVault inbound webhook with HMAC (see signing.py)."""

from __future__ import annotations

import os
import sys
import uuid

import requests
from confluent_kafka import Consumer, KafkaException, Producer
from signing import hmac_sha256_hex, kafka_value_to_signed_body

TOPIC_TRIGGERS = "planvault.triggers"
TOPIC_DLQ = "planvault.triggers.dlq"


def _required(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"Missing env: {name}", file=sys.stderr)
        sys.exit(1)
    return v


def _env_or_default(name: str, default: str) -> str:
    v = os.environ.get(name, "").strip()
    return v if v else default


def main() -> None:
    base_url = _env_or_default("PLANVAULT_BASE_URL", "https://api.planvault.ai").rstrip("/")
    org_id = _required("PLANVAULT_ORG_ID")
    trigger_key = _required("PLANVAULT_TRIGGER_KEY")
    secret = _required("PLANVAULT_WEBHOOK_SECRET")
    brokers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "127.0.0.1:19092").strip()
    group = os.environ.get("PLANVAULT_KAFKA_GROUP_ID", "planvault-example-python").strip()

    url = f"{base_url}/api/v1/orgs/{org_id}/webhooks/{trigger_key}"

    consumer = Consumer(
        {
            "bootstrap.servers": brokers,
            "group.id": group,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    producer = Producer({"bootstrap.servers": brokers})
    consumer.subscribe([TOPIC_TRIGGERS])

    print(f"Listening on {TOPIC_TRIGGERS} @ {brokers}", flush=True)

    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                raise KafkaException(msg.error())

            raw_bytes = msg.value()
            if raw_bytes is None:
                consumer.commit(msg, asynchronous=False)
                continue

            body, _ok_json = kafka_value_to_signed_body(raw_bytes)
            sig = hmac_sha256_hex(secret, body)
            req_id = str(uuid.uuid4())
            commit = True
            try:
                r = requests.post(
                    url,
                    data=body.encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "X-Signature": sig,
                        "X-Request-Id": req_id,
                    },
                    timeout=60,
                )
                if r.status_code in (400, 403, 404):
                    producer.produce(TOPIC_DLQ, body.encode("utf-8"))
                    producer.flush(10)
                elif r.status_code == 429:
                    print("[warn] HTTP 429 rate limited; not committing offset for retry", flush=True)
                    commit = False
                elif r.status_code >= 500:
                    print(
                        f"[warn] HTTP {r.status_code} server error; "
                        "not committing offset for retry",
                        flush=True,
                    )
                    commit = False
                elif not r.ok:
                    echoed = r.headers.get("X-Request-Id", req_id)
                    print(
                        f"[warn] HTTP {r.status_code} -> DLQ (X-Request-Id={echoed})",
                        flush=True,
                    )
                    producer.produce(TOPIC_DLQ, body.encode("utf-8"))
                    producer.flush(10)
            except requests.RequestException as e:
                print(f"[warn] request failed: {e}; not committing offset for retry", flush=True)
                commit = False
            if commit:
                consumer.commit(msg, asynchronous=False)
    finally:
        consumer.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit(0) from None
