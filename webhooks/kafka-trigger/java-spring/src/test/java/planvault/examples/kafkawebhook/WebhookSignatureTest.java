// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class WebhookSignatureTest {

  @Test
  void hmacSha256Hex_matchesJavaxCrypto() throws Exception {
    byte[] secret = "test-secret".getBytes(StandardCharsets.UTF_8);
    String body = "{\"a\":1,\"b\":\"x\"}";
    String expected = referenceHmac(secret, body);
    assertEquals(expected, WebhookSignature.hmacSha256Hex(secret, body));
  }

  @Test
  void hmacSha256Hex_isLowercaseHex64() {
    byte[] secret = "k".getBytes(StandardCharsets.UTF_8);
    String out = WebhookSignature.hmacSha256Hex(secret, "v");
    assertEquals(64, out.length());
    assertTrue(out.matches("[0-9a-f]+"));
  }

  private static String referenceHmac(byte[] secret, String body) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret, "HmacSHA256"));
    byte[] raw = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder(raw.length * 2);
    for (byte b : raw) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }
}
