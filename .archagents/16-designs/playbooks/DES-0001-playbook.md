---
id: DES-0001-playbook
created_at: 2026-11-21T18:00:32Z
status: approved
design: DES-0001
ticket: TCK-0001
approved_at: 2026-11-21T18:00:32Z
approved_by: codex
executed_at: null
executed_runs: []
dry_run_supported: true
total_steps: 4
destructive_steps: 0
environments:
  - dev
estimated_duration: 30min-2h
branch_prefix: feat/
branch_name: feat/TCK-0001-v0.1.0-catalog
commit_per_step: false
commit_message_format: "feat(TCK-0001): passo N/4 - <titulo>"
---
# Playbook - DES-0001

**Ticket:** TCK-0001
**Objetivo:** [SPC-0001] Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI/Transferegov/SADIPEM)

## Pre-requisitos

- [ ] Bootstrap inicial na branch `main` commitado e `npm install` concluído.
- [ ] Branch `feat/TCK-0001-v0.1.0-catalog` criada a partir de `main`.

## Modo dry-run

`/ops-execute DES-0001 --dry-run`

## Passos

1. **Passo 1 — Core, Config, Adapters & Cloudflare Worker:** implementar `lib/bin/mcp-orcamento.ts`, `lib/index.ts`, `lib/types/`, `lib/config/`, `lib/core/`, `lib/infrastructure/`, `lib/shared/` (base), `lib/adapters/` e `lib/workers/`.
2. **Passo 2 — Catálogo de 8 Tools Orçamentárias (`SICONFI`, `Transferegov`, `Tesouro`):** implementar `lib/shared/orcamento-schemas.ts` e `lib/tools/{siconfi,transferegov,tesouro,index}.ts`.
3. **Passo 3 — Documentação & Governança `SC-9`:** atualizar `README.md`, `PRIVACY.md`, `NOTICE.md`, `AGENTS.md`, `CLAUDE.md`, `.archagents/*` e allowlist/capabilities.
4. **Passo 4 — Testes Unitários (Cobertura >= 85%) & Transporte Dual:** implementar `test/unit/*.test.ts` e `test/integration/transports.mjs`, validar `tsc`, `vitest --coverage`, `test:transport`, `verify-tool-allowlist.py` e `criteria-check.py`.

## Criterios de sucesso do playbook

- [ ] Acceptance do ticket passa.
- [ ] Suite relevante passa.

## Log de execucoes

- *(sem execucoes ainda)*
