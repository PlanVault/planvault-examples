# SPDX-License-Identifier: Apache-2.0
"""HMAC and JSON body preparation for PlanVault inbound webhooks.

PlanVault verifies ``X-Signature`` as hex(HMAC-SHA256(secret, body_utf8)) where ``body`` matches
parsed JSON re-serialized without extra whitespace (Circe ``noSpaces``). Workers should POST the
exact UTF-8 bytes they sign.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Tuple


def hmac_sha256_hex(secret: str, body: str) -> str:
    """Return lowercase hex digest for HMAC-SHA256."""
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()


def compact_json(value: object) -> str:
    """Serialize JSON with minimal separators (no spaces)."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def kafka_value_to_signed_body(raw_bytes: bytes) -> Tuple[str, bool]:
    """Decode Kafka value: if valid JSON, return compact re-encoding; else raw text (may break HMAC)."""
    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return raw_bytes.decode("utf-8", errors="replace"), False
    return compact_json(payload), True
