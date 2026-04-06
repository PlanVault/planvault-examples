# Java (Spring Kafka + WebClient) worker

```bash
export PLANVAULT_BASE_URL=https://api.planvault.ai
export PLANVAULT_ORG_ID=...
export PLANVAULT_TRIGGER_KEY=...
export PLANVAULT_WEBHOOK_SECRET=...
export KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:19092
mvn -q spring-boot:run
```

Configuration: [src/main/resources/application.yml](src/main/resources/application.yml).

Package without running the app:

```bash
mvn -q verify -DskipTests
```
