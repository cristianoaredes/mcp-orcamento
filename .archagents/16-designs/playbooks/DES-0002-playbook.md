---
id: DES-0002-playbook
created_at: 2026-11-21T19:34:13Z
status: approved
design: DES-0002
ticket: TCK-0002
approved_at: 2026-11-21T19:34:13Z
approved_by: codex
executed_at: null
executed_runs: []
dry_run_supported: true
total_steps: 2
destructive_steps: 0
environments:
  - dev
estimated_duration: 30min-2h
branch_prefix: docs/
branch_name: docs/TCK-0002-readme-orqo-standard
commit_per_step: false
commit_message_format: "docs(TCK-0002): passo N/2 - <titulo>"
---
# Playbook - DES-0002

**Ticket:** TCK-0002
**Objetivo:** README.md padrão Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json (mcp-orcamento)

## Pre-requisitos

- [x] Branch `docs/TCK-0002-readme-orqo-standard` criada a partir de `main`.
- [x] Escopo `DES-0002` declarado (`CONTRIBUTING.md`, `.mcprc.example.json`, `README.md`, `package.json`).

## Modo dry-run

`/ops-execute DES-0002 --dry-run`

## Passos

1. **Passo 1 — `.mcprc.example.json`, `package.json` e `CONTRIBUTING.md`:** criar `.mcprc.example.json` aderente a `lib/config/index.ts`, registrar em `package.json` `"files"`, e criar `CONTRIBUTING.md` bilíngue (PT-BR/EN) descrevendo a arquitetura modular `lib/`.
2. **Passo 2 — `README.md` padrão Orqo/`mcp-dadosbr` e validação:** reescrever `README.md` (~360–430 linhas) com todas as seções, badges, âncoras, fluxos e evidências verificadas no código; rodar builds, Vitest, `criteria-check.py`, `check-scope.py` e `secret-scan.sh`.

## Criterios de sucesso do playbook

- [ ] Acceptance do ticket passa (`4/4` checks em `criteria-check.py`).
- [ ] `npm run build && npm run build:worker` e `npx vitest run` passam.

## Log de execucoes

- *(sem execucoes ainda)*
