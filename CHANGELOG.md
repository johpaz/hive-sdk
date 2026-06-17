# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.17] - 2026-05-28

### Changed
- **CLI bin renombrado**: `hive` → `hives` para evitar conflicto con `@johpaz/hive-agents` (harness original)
- Marca actualizada: removidas referencias a "Anomaly Co." — ahora consistente con `johpaz` / `tuprofedeia`
- `.npmignore` creado para paquete limpio
- `.github/CODEOWNERS` actualizado

## [0.0.16] - 2026-05-28

### Added
- **Bun Workers individuales**: `createWorker()`, `WorkerPool`, `agent.worker.ts`
  - Workers especializados con system prompt propio
  - Ejecución en threads aislados via `Bun.Worker`
  - Comunicación via `postMessage`/`onmessage`
- **Gateway simplificado**: HTTP/WebSocket server con `Bun.serve()`
  - Endpoints: `/status`, `/chat`, `/ws`
  - Streaming de respuestas en tiempo real
- **Channels**: Telegram, Discord, WhatsApp, Slack, Webchat
- **Tool Runtime**: Ejecución paralela de tools via Bun Workers
- **CLI mejorado**:
  - `hive create-app <name>` — Generar app harness completa
  - `hive add-tool <name>` — Generar boilerplate de tool
  - `hive add-skill <name>` — Generar boilerplate de skill
  - `hive add-worker <name>` — Generar Bun Worker
- **Template hive-app**: Proyecto harness completo con Docker, config, gateway
- **Tests del harness**: 39 tests pasando en 12 archivos
  - Workers, Gateway, Channels, Canvas, Scheduler, Storage, Swarm, Tool Runtime

### Changed
- API pública expandida: exports de gateway, channels, canvas, scheduler, tool-runtime, workers
- `package.json`: versión 0.0.16, descripción actualizada, bin `hive`
- Documentación actualizada en `docs/`

## [0.0.10] - 2026-05-02

### Added
- DAG Scheduler with parallel worker execution
- Tool selector with FTS5 full-text search
- Skill selector with semantic triggers
- Context compiler for agent execution
- Canvas (ACE) real-time visualization
- Multi-channel support (Slack, Discord, Telegram, WhatsApp)
- AgentBus for inter-agent communication
- SQLite storage with FTS5 built-in
- 130+ passing tests

### Performance
- 3x faster than LangChain (Bun runtime)
- Parallel DAG execution (15x faster than sequential)
- Streaming TTFT benchmarks
- Worker metrics (12 tasks/sec throughput)

### Documentation
- Complete API documentation in docs/
- README comparison with LangChain
- Benchmark documentation

## [0.0.9] - 2026-01-01

### Added
- Initial release
- Agent execution with LLM providers
- Basic tool and skill system
- Gateway server
