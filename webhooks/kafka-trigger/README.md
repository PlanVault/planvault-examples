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

## DLQ and retries

PlanVault returns **RFC 7807** `application/problem+json` on errors. For inbound webhooks, bad HMAC, unknown org/trigger, or disabled triggers typically map to **HTTP 404** (generic “not found”), not **403**.

Workers in this folder:

- Send **400 / 403 / 404** payloads to **`planvault.triggers.dlq`** and **commit** the offset (non-retryable client errors).
- On **429** or **5xx** (or transport failure), **do not commit** so Kafka can redeliver after backoff.

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
