# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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