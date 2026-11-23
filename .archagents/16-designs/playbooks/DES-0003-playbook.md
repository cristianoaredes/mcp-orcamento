---
id: DES-0003-playbook
created_at: 2026-11-23T13:07:00Z
status: approved
design: DES-0003
ticket: TCK-0003
approved_at: 2026-11-23T13:07:00Z
approved_by: antigravity
executed_at: null
executed_runs: []
dry_run_supported: true
total_steps: 5
destructive_steps: 0
environments:
  - dev
estimated_duration: 15min-45min
branch_prefix: docs/
branch_name: docs/TCK-0003-seo-geo-docs
commit_per_step: false
commit_message_format: "docs(TCK-0003): passo N/5 - <titulo>"
---
# Playbook - DES-0003

**Ticket:** TCK-0003
**Objetivo:** docs: documentação SEO/GEO padrão DadosBR (mcp-orcamento)

## Pre-requisitos

- [x] Branch `docs/TCK-0003-seo-geo-docs` criada a partir de `main`.
- [x] Escopo `DES-0003` declarado (`README.md`, `package.json`, `CHANGELOG.md`, `llms.txt`, `docs/*`).

## Passos

1. **Passo 1 — Auditoria e atualização de `README.md`:** corrigir divergências contra `lib/` (`MCP_HTTP_TIMEOUT` vs `MCP_API_TIMEOUT`, `siconfi_rgf`/`siconfi_entes`/`tesouro`, aviso explícito de pacote npm ainda não publicado), reforçar definição de entidade + FAQ SEO/GEO + seção English + links para `docs/`, `CHANGELOG.md` e `llms.txt`.
2. **Passo 2 — Criação de `docs/`:** criar `docs/README.md`, `docs/CONFIGURATION.md`, `docs/MCP_CLIENT_INTEGRATION.md`, `docs/USAGE_EXAMPLES.md` (com saídas reais observadas) e `docs/pt-br/README.md`.
3. **Passo 3 — Criação de `CHANGELOG.md` e `llms.txt`:** documentar `[Unreleased]` e `[0.1.0]` a partir de `git log`/TCKs e gerar `llms.txt` no padrão llmstxt.org.
4. **Passo 4 — Metadados `package.json` & GitHub:** revisar `description`/`keywords` de `package.json` e topics do GitHub (`emendas-parlamentares`, `lrf`, `dados-abertos`).
5. **Passo 5 — Verificação & P10:** executar `npm test`, `npm run build`, `npm run build:worker`, checar links/âncoras/contagens, rodar P10 research verifier e registrar RUN/VER.
