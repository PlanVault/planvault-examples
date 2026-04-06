# Contributing

Thank you for improving these examples.

## Workflow

1. Open a pull request with a short description of the change.
2. Keep examples **minimal** and **focused**—avoid unrelated refactors.
3. Run checks locally when you touch a stack:
   - **React:** `cd frontend/react-chat && npm ci && npm test && npm run build`
   - **Scala:** `cd webhooks/kafka-trigger/scala-fs2 && sbt test`
   - **Java:** `cd webhooks/kafka-trigger/java-spring && mvn test`
   - **Python:** from this directory: `pip install pytest ruff && ruff check webhooks/kafka-trigger/python-confluent mcp/python-sqlite webhooks/kafka-trigger/python-confluent/tests mcp/python-sqlite/tests && pytest`
   - **Bash:** `shellcheck scripts/bash-e2e/script.sh`

## License

By contributing, you agree that your contributions are licensed under the same terms as this directory: [Apache License 2.0](LICENSE).
