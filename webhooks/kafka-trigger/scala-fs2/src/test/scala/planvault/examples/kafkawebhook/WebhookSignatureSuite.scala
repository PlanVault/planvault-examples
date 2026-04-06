// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook

import munit.FunSuite

class WebhookSignatureSuite extends FunSuite {

  test("hmacSha256Hex matches known vector (cross-checked with Python hmac)") {
    val secret = "test-secret"
    val body   = """{"a":1,"b":"x"}"""
    val got    = WebhookSignature.hmacSha256Hex(secret, body)
    assertEquals(
      got,
      "e9ec052df47d694f797c11fc574e89f658d85455da41a39565eedc28a9a20109",
    )
  }

  test("hmacSha256Hex is stable for same inputs") {
    val s = WebhookSignature.hmacSha256Hex("k", "v")
    assertEquals(WebhookSignature.hmacSha256Hex("k", "v"), s)
  }
}
