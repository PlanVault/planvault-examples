// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HMAC signing for PlanVault inbound webhooks (`hmac_sha256` trigger auth).
  *
  * The server recomputes the signature over Circe's `body.noSpaces` UTF-8 bytes. For typical compact
  * JSON, signing the exact POST body bytes matches that value—see project docs and worker READMEs.
  */
object WebhookSignature {

  /** Hex-encoded HMAC-SHA256 of `body` using `secret` as UTF-8 key bytes. */
  def hmacSha256Hex(secret: String, body: String): String = {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(new SecretKeySpec(secret.getBytes("UTF-8"), "HmacSHA256"))
    mac.doFinal(body.getBytes("UTF-8")).map("%02x".format(_)).mkString
  }
}
