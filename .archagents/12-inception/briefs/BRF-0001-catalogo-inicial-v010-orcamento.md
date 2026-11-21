---
id: BRF-0001
slug: catalogo-inicial-v010-orcamento
title: "Catálogo inicial v0.1.0 do @aredes.me/mcp-orcamento (8 tools Worker-safe SICONFI, Transferegov, SADIPEM e CKAN)"
created_at: "2026-11-21T14:25:00-03:00"
status: promoted
linked_discovery: DSC-0001
linked_spec: SPC-0001
external_refs: []
---

# BRF-0001 — Catálogo inicial v0.1.0 do `@aredes.me/mcp-orcamento`

## Problema / oportunidade

Falta no portfólio `@aredes.me/*` um servidor MCP especializado, sem API key e compatível com Node.js (`stdio` / `HTTP+SSE`) e Cloudflare Workers para consultar execução orçamentária/fiscal (SICONFI: Entes, Extrato de Entregas, RREO, RGF, DCA), transferências especiais/Fundo a Fundo/TED (Transferegov) e operações de crédito/datasets do Tesouro (SADIPEM PVL e CKAN).

## Escopo aprovado (Opção A — 8 tools Worker-safe)

1. `siconfi_entes`
2. `siconfi_extrato_entregas`
3. `siconfi_rreo`
4. `siconfi_rgf`
5. `siconfi_dca`
6. `transferegov_emendas_especiais`
7. `transferegov_fundo_a_fundo_ted`
8. `tesouro_operacoes_credito_ckan`

Todas com validação Zod `.strict()`, zero `node:*` na camada core/shared/tools/workers, proteção SSRF, sanitização anti-injeção PostgREST e anti-prompt-injection (`sanitizeUntrustedText`, `UNTRUSTED_EXTERNAL_DATA_NOTICE`, `serializeBoundedToolOutput`), mais `lgpd_notice` para dados nominais parlamentares.

## Decisão

Promovido para `SPC-0001` após aprovação do operador em `2026-11-21T14:33:08-03:00`.
