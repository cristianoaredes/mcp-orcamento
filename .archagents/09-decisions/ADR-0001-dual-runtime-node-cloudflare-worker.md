---
id: ADR-0001
title: "Arquitetura dual-runtime Node.js (stdio/HTTP+SSE) e Cloudflare Worker sem dependência node:* na camada de domínio"
status: accepted
date: 2026-11-21
deciders: cristiano
tickets:
  - TCK-0001
supersedes: []
---
# ADR-0001 - Arquitetura dual-runtime Node.js (stdio/HTTP+SSE) e Cloudflare Worker sem dependência `node:*` na camada de domínio

## Contexto

O `mcp-orcamento` nasce clonando a arquitetura dual-runtime do `@aredes.me/mcp-dadosbr` (`v0.7.0`), onde um único catálogo de ferramentas atende simultaneamente clientes locais via CLI Node.js (`stdio` e `HTTP/SSE`) e clientes remotos via Cloudflare Workers (`POST /mcp`, `/sse`, `/tools/{toolName}`, `/openapi.json`, `/health`).

O Cloudflare Workers impõe limite rígido de 128 MB de RAM por isolate e execução Web-standard *stateless* sem sistema de arquivos local (`node:fs`) nem ciclo de importação entre núcleo (`lib/core/`) e ferramentas (`lib/tools/`).

## Decisao

1. **Separação estrita de camadas (`lib/tools/` -> `lib/core/` -> `lib/shared/`):** `lib/core/` nunca importa `lib/tools/`; os schemas Zod públicos residem em `lib/shared/orcamento-schemas.ts` e são re-exportados em `lib/core/tool-schemas.ts` sem acoplamento cíclico.
2. **Zero imports `node:*` em `lib/shared/`, `lib/tools/`, `lib/core/` e `lib/workers/`:** `lib/core/mcp-server.ts` não usa `node:fs` e retorna `resources: []` em `ListResources`, mantendo paridade direta com o Worker e respeitando `<= 180` linhas.
3. **Endpoints REST genéricos no Worker:** expor `POST /tools/{toolName}` sobre `hasTool(toolName)` + `handleMCPRequest` + OpenAPI 3.0 com enum das 8 ferramentas, mantendo autenticação fail-closed via `MCP_API_KEY` e OAuth desabilitado (`501`).
4. **Exclusão de rotas legadas ou pesadas:** excluir `/maisbrasil` e `/siconv` (HTTP 404 na origem) e `/obrasgov` (timeout >10s) na `v0.1.0`, mantendo apenas APIs Worker-safe (SICONFI, Transferegov `transferenciasespeciais`/`fundoafundo`/`ted`, SADIPEM/PVL e Tesouro Transparente CKAN).

## Alternativas descartadas

- **Servidor exclusivo Node.js com ETL/SQLite local para dumps orçamentários:** inviabilizaria execução *stateless* no Cloudflare Workers e duplicaria código de transporte.
- **Reintroduzir `node:fs` ou MCP Apps HTML no `v0.1.0`:** aumentaria superfície e acoplamento sem necessidade funcional para o catálogo inicial de 8 ferramentas textuais/JSON.

## Consequencias

- **Positivas:** compilação limpa para `tsconfig.json` (Node16) e `tsconfig.worker.json` (ESNext/Bundler), paridade total de 8 ferramentas entre `stdio`, `HTTP/SSE` e Cloudflare Worker, e isolamento contra SSRF e injeção PostgREST em todas as entradas.
- **Custos / Trade-offs:** cargas extensas de SICONFI (RREO/RGF/DCA/Entes) e SADIPEM (PVL) exigem filtragem e paginação server-side (`<= 50` itens) em memória dentro do Worker após fetch único com timeout de `15_000ms`. Comportamento em edge Cloudflare de produção permanece *a confirmar* no ambiente de deploy.

## Evidencias

- `tsconfig.json`
- `tsconfig.worker.json`
- `wrangler.toml`
- `.archagents/12-inception/specs/SPC-0001-catalogo-inicial-v010-orcamento.md`
