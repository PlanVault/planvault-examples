// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * HMAC-SHA256 signing for PlanVault inbound webhooks ({@code hmac_sha256} trigger auth).
 *
 * <p>PlanVault verifies a hex digest over canonical JSON bytes; workers should POST the same UTF-8
 * string they sign (compact JSON). See {@code planvault-examples/webhooks/kafka-trigger/README.md}.
 */
public final class WebhookSignature {

  private WebhookSignature() {}

  /** Lowercase hex HMAC-SHA256 of {@code body} using {@code secretUtf8} as the key. */
  public static String hmacSha256Hex(byte[] secretUtf8, String body) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secretUtf8, "HmacSHA256"));
      byte[] raw = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(raw.length * 2);
      for (byte b : raw) {
        sb.append(String.format("%02x", b));
      }
      return sb.toString();
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
