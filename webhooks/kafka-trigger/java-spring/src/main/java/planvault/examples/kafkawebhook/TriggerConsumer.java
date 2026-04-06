// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook;

import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

/** Kafka consumer: forwards message payload to PlanVault inbound webhook with {@code X-Signature}. */
@Component
public class TriggerConsumer {

  private static final String TOPIC_DLQ = "planvault.triggers.dlq";

  private final WebClient webClient;
  private final KafkaTemplate<String, String> kafkaTemplate;
  private final String baseUrl;
  private final String orgId;
  private final String triggerKey;
  private final byte[] secret;

  public TriggerConsumer(
      WebClient webClient,
      KafkaTemplate<String, String> kafkaTemplate,
      @Value("${planvault.base-url}") String baseUrl,
      @Value("${planvault.org-id}") String orgId,
      @Value("${planvault.trigger-key}") String triggerKey,
      @Value("${planvault.webhook-secret}") String webhookSecret) {
    this.webClient = webClient;
    this.kafkaTemplate = kafkaTemplate;
    this.baseUrl = baseUrl.replaceAll("/$", "");
    this.orgId = orgId;
    this.triggerKey = triggerKey;
    this.secret = webhookSecret.getBytes(StandardCharsets.UTF_8);
  }

  @KafkaListener(topics = "planvault.triggers", containerFactory = "kafkaListenerContainerFactory")
  public void consume(String payload, Acknowledgment ack) {
    try {
      String sig = WebhookSignature.hmacSha256Hex(secret, payload);
      String uri = baseUrl + "/api/v1/orgs/" + orgId + "/webhooks/" + triggerKey;
      webClient
          .post()
          .uri(uri)
          .contentType(MediaType.APPLICATION_JSON)
          .header("X-Signature", sig)
          .bodyValue(payload)
          .retrieve()
          .toBodilessEntity()
          .block();
    } catch (WebClientResponseException ex) {
      if (ex.getStatusCode() == HttpStatus.FORBIDDEN) {
        kafkaTemplate.send(TOPIC_DLQ, payload).join();
      }
    } finally {
      ack.acknowledge();
    }
  }
}
