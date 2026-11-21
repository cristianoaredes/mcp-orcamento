---
id: TCK-0001
slug: spc-0001-implementacao-inicial-mcp-orcamento-v0-1-0-8-tools-worker-safe-siconfi
title: "[SPC-0001] Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI/Transferegov/SADIPEM)"
source: spec
created_at: 2026-11-21T17:59:50Z
created_by: ops
updated_at: 2026-11-21T18:23:42Z
status: verifying
severity: medium
category: feature
effort: M
flow: normal
ceremony: full
business_impact: ""
linked_findings: []
linked_designs:
  - DES-0001
linked_runs:
  - RUN-20261121-180212-tck-0001
linked_verifications: []
linked_docs:
  - .archagents/12-inception/specs/SPC-0001-catalogo-inicial-v010-orcamento.md
external_refs: []
external_sync: []
blocks: []
blocked_by: []
related: []
acceptance:
  - check: "npm run build && npm run build:worker"
  - check: "node -e \"import('./build/lib/core/tools.js').then(m => { const names = m.TOOL_DEFINITIONS.map(t => t.name); if (names.length !== 8) process.exit(1); console.log('TOOLS_OK:' + names.length); })\""
    expect: TOOLS_OK:8
  - check: "node -e \"import('node:fs').then(fs => { const allow = JSON.parse(fs.readFileSync('.archagents/mcp-tool-allowlist.json','utf8')); const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.version !== '0.1.0' || allow.entries.length !== 8) process.exit(1); console.log('ALLOWLIST_AND_VERSION_OK'); })\""
    expect: ALLOWLIST_AND_VERSION_OK
  - check: "npx vitest run --coverage"
  - check: "npm run test:transport"
linked_spec: SPC-0001
security_sensitive: true
---
# TCK-0001 - [SPC-0001] Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI/Transferegov/SADIPEM)

## Contexto

Compilado de `SPC-0001` (`BRF-0001` / `DSC-0001`). Implementação inicial do servidor MCP `@aredes.me/mcp-orcamento` `v0.1.0` com 8 ferramentas read-only Worker-safe (SICONFI, Transferegov, SADIPEM/PVL, Tesouro Transparente CKAN), adaptadores Node (`stdio` / `HTTP+SSE`) e Cloudflare Workers (`POST /tools/{toolName}`, `/mcp`, `/sse`, `/openapi.json`, `/health`).

## Falsificador

Antes da execução, `lib/` e `test/` ainda não existem no repositório, fazendo `npm run build`, `npm run build:worker`, `npx vitest run --coverage` e `npm run test:transport` falharem.

## Log de transicoes

- 2026-11-21T17:59:50Z - **raw** - criado via scripts/ops/ticket/create.py.
- 2026-11-21T18:00:31Z - **triaged** - Triagem automática de spec compilada SPC-0001 (ceremony: full, security_sensitive: true)
- 2026-11-21T18:01:36Z - **designed** - DES-0001 aprovado com Threat Model T1..T6 e escopo completo para TCK-0001
- 2026-11-21T18:02:13Z - **executing** - Iniciar execução live TCK-0001 sob DES-0001 na branch feat/TCK-0001-v0.1.0-catalog
- 2026-11-21T18:23:42Z - **verifying** - Implementação completa v0.1.0 (8 tools, build/worker, 14 unit suites / 50 tests, 91.68% stmts / 81.12% branches / 92.43% funcs / 92.25% lines, stdio + HTTP/SSE transport ok); pronto para verificação P10 independente
