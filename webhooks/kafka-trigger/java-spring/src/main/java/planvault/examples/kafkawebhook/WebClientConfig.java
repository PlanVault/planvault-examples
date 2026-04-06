// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook;

import io.netty.channel.ChannelOption;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

/** Tuned {@link WebClient} for outbound webhook calls (timeouts). */
@Configuration
public class WebClientConfig {

  @Bean
  public WebClient planVaultWebhookWebClient(WebClient.Builder builder) {
    HttpClient httpClient =
        HttpClient.create()
            .responseTimeout(Duration.ofSeconds(60))
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000);
    return builder.clientConnector(new ReactorClientHttpConnector(httpClient)).build();
  }
}
