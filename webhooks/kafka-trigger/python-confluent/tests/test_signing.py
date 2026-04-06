# SPDX-License-Identifier: Apache-2.0
"""Tests for webhook signing helpers."""

from __future__ import annotations

import hashlib
import hmac as std_hmac

from signing import compact_json, hmac_sha256_hex, kafka_value_to_signed_body


def test_hmac_sha256_hex_matches_stdlib() -> None:
    secret = "test-secret"
    body = '{"a":1,"b":"x"}'
    expected = std_hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert hmac_sha256_hex(secret, body) == expected


def test_compact_json_no_spaces() -> None:
    s = compact_json({"b": 2, "a": 1})
    assert " " not in s
    assert s == '{"b":2,"a":1}'


def test_kafka_value_to_signed_body_valid_json() -> None:
    raw = b'{"x": 1}'
    body, ok = kafka_value_to_signed_body(raw)
    assert ok is True
    assert body == '{"x":1}'


def test_kafka_value_to_signed_body_invalid() -> None:
    raw = b"not-json"
    body, ok = kafka_value_to_signed_body(raw)
    assert ok is False
    assert body == "not-json"
