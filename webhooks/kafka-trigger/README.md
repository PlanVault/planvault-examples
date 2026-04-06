# Kafka → PlanVault inbound webhook

**License:** [Apache-2.0](../../LICENSE) (this `planvault-examples` tree).

Consumes JSON messages from topic `planvault.triggers`, signs the **exact** UTF-8 body bytes with HMAC-SHA256 (hex), and `POST`s to:

`{PLANVAULT_BASE_URL}/api/v1/orgs/{orgId}/webhooks/{triggerKey}`

PlanVault verifies the signature against the canonical JSON (`body.noSpaces` after parse). Use **compact JSON** (no extra spaces) so your bytes match the server.

## Broker (Redpanda)

From this directory:

```bash
docker compose up -d
export KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:19092
```

Reset volumes if you need a clean state: `docker compose down -v`.

## Environment

See [../../.env.example](../../.env.example). Worker-specific:

| Variable | Description |
|----------|-------------|
| `PLANVAULT_BASE_URL` | Default in examples: `https://api.planvault.ai` |
| `PLANVAULT_ORG_ID` | UUID |
| `PLANVAULT_TRIGGER_KEY` | Inbound trigger key |
| `PLANVAULT_WEBHOOK_SECRET` | Shared secret (HMAC) |
| `KAFKA_BOOTSTRAP_SERVERS` | `127.0.0.1:19092` when using compose |
| `PLANVAULT_KAFKA_GROUP_ID` | Unique per implementation (default baked in each app) |

## Message shape

The Kafka **value** must be valid JSON (UTF-8). Example:

```json
{"message":"Say hello","externalUserId":"kafka-user-1"}
```

Fields are forwarded into the trigger template as `body.*` (see PlanVault docs).

## DLQ

On HTTP **403** (bad signature / auth), the message is published to `planvault.triggers.dlq` and the consumer commits the offset.

## Run a worker

- Scala: [scala-fs2/README.md](scala-fs2/README.md)
- Java: [java-spring/README.md](java-spring/README.md)
- Python: [python-confluent/README.md](python-confluent/README.md)

## Produce a test message

```bash
echo '{"message":"ping from cli","externalUserId":"cli-user"}' | docker compose exec -T redpanda \
  rpk topic produce planvault.triggers --brokers 127.0.0.1:9092
```

(Inside the container the broker is `127.0.0.1:9092`; from the host use `rpk` with `--brokers 127.0.0.1:19092`.)

```bash
echo '{"message":"ping","externalUserId":"cli"}' | rpk topic produce planvault.triggers --brokers 127.0.0.1:19092
```
