# Scala (fs2-kafka + sttp) worker

```bash
export PLANVAULT_BASE_URL=https://api.planvault.ai
export PLANVAULT_ORG_ID=...
export PLANVAULT_TRIGGER_KEY=...
export PLANVAULT_WEBHOOK_SECRET=...
export KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:19092
sbt run
```

Default consumer group: `planvault-example-scala`. Override with `PLANVAULT_KAFKA_GROUP_ID`.
