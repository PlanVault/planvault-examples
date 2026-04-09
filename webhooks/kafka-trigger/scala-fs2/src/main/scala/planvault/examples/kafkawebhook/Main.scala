// SPDX-License-Identifier: Apache-2.0
package planvault.examples.kafkawebhook

import cats.effect.{ExitCode, IO, IOApp}
import fs2.kafka._
import sttp.client3._
import sttp.client3.httpclient.fs2.HttpClientFs2Backend
import sttp.model.Uri

import java.util.UUID

/** Consumes `planvault.triggers`, POSTs JSON to PlanVault inbound webhook with `X-Signature`.
  *
  * On HTTP 400 / 403 / 404 (bad body, legacy forbidden, or PlanVault’s unified “not found” for bad HMAC / unknown trigger),
  * forwards the payload to `planvault.triggers.dlq` and commits the offset.
  * On HTTP 429 or 5xx (or transport failure), does **not** commit so the message can be redelivered.
  */
object Main extends IOApp {

  private val TopicTriggers = "planvault.triggers"
  private val TopicDlq      = "planvault.triggers.dlq"

  def run(args: List[String]): IO[ExitCode] =
    HttpClientFs2Backend.resource[IO]().use { backend =>
      envConfig.flatMap { cfg =>
        val consumerSettings =
          ConsumerSettings[IO, String, String]
            .withBootstrapServers(cfg.bootstrapServers)
            .withGroupId(cfg.groupId)
            .withAutoOffsetReset(AutoOffsetReset.Earliest)
            .withEnableAutoCommit(false)

        val producerSettings =
          ProducerSettings[IO, String, String].withBootstrapServers(cfg.bootstrapServers)

        val webhookUri =
          Uri.unsafeParse(
            s"${cfg.baseUrl.stripSuffix("/")}/api/v1/orgs/${cfg.orgId}/webhooks/${cfg.triggerKey}",
          )

        KafkaProducer
          .stream(producerSettings)
          .flatMap { producer =>
            KafkaConsumer
              .stream(consumerSettings)
              .subscribeTo(TopicTriggers)
              .records
              .evalMap { comm =>
                val raw = comm.record.value
                val sig = WebhookSignature.hmacSha256Hex(cfg.secret, raw)
                val reqId = UUID.randomUUID().toString
                val req = basicRequest
                  .post(webhookUri)
                  .contentType("application/json")
                  .header("X-Signature", sig)
                  .header("X-Request-Id", reqId)
                  .body(raw)

                backend.send(req).attempt.flatMap {
                  case Right(res) if res.isSuccess =>
                    comm.offset.commit
                  case Right(res) if Set(400, 403, 404)(res.code.code) =>
                    val key = Option(comm.record.key).getOrElse("")
                    val pr  = ProducerRecords.one(ProducerRecord(TopicDlq, key, raw))
                    producer.produce(pr) *> comm.offset.commit
                  case Right(res) if res.code.code == 429 =>
                    IO.println(s"[warn] HTTP 429 rate limited; offset not committed for retry: ${comm.offset}")
                  case Right(res) if res.code.isServerError =>
                    IO.println(s"[warn] HTTP ${res.code} server error; offset not committed: ${comm.offset}")
                  case Right(res) =>
                    val key = Option(comm.record.key).getOrElse("")
                    val pr  = ProducerRecords.one(ProducerRecord(TopicDlq, key, raw))
                    IO.println(s"[warn] HTTP ${res.code} -> DLQ offset=${comm.offset}") *>
                      producer.produce(pr) *>
                      comm.offset.commit
                  case Left(err) =>
                    IO.println(s"[error] request failed (offset not committed): $err")
                }
              }
          }
          .compile
          .drain
      }
    }.as(ExitCode.Success)

  private def envConfig: IO[Config] = IO.delay {
    val baseUrl = optionalEnv("PLANVAULT_BASE_URL", "https://api.planvault.ai")
    val orgId      = requiredEnv("PLANVAULT_ORG_ID")
    val triggerKey = requiredEnv("PLANVAULT_TRIGGER_KEY")
    val secret     = requiredEnv("PLANVAULT_WEBHOOK_SECRET")
    val brokers =
      Option(System.getenv("KAFKA_BOOTSTRAP_SERVERS")).filter(_.nonEmpty).getOrElse("127.0.0.1:19092")
    val groupId =
      Option(System.getenv("PLANVAULT_KAFKA_GROUP_ID")).filter(_.nonEmpty).getOrElse("planvault-example-scala")
    Config(baseUrl, orgId, triggerKey, secret, brokers, groupId)
  }

  private def optionalEnv(name: String, default: String): String =
    Option(System.getenv(name)).map(_.trim).filter(_.nonEmpty).getOrElse(default)

  private def requiredEnv(name: String): String =
    Option(System.getenv(name)).map(_.trim).filter(_.nonEmpty).getOrElse {
      throw new IllegalStateException(s"Missing required env: $name")
    }

  private final case class Config(
      baseUrl: String,
      orgId: String,
      triggerKey: String,
      secret: String,
      bootstrapServers: String,
      groupId: String,
  )
}
