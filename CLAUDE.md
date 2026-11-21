# Governança codebase-ops

Leia [AGENTS.md](AGENTS.md) e o [índice do projeto](.archagents/README.md) antes de executar ações.

# CLAUDE.md

Guidance for AI coding agents working in `@aredes.me/mcp-orcamento` (`v0.1.0`).

## Project Overview

MCP Orçamento (`@aredes.me/mcp-orcamento`, `AGPL-3.0-only`) is a dual-runtime Model Context Protocol server (Node.js `stdio` / `HTTP+SSE` and Cloudflare Workers) providing 8 read-only, no-API-key tools over Brazilian public fiscal and budget APIs (SICONFI, Transferegov, SADIPEM/PVL, Tesouro Transparente CKAN).

## Development Commands

```bash
npm install
npm run build             # Compile Node build/ via tsc
npm run build:worker      # Compile Cloudflare Worker target via tsconfig.worker.json
npm run test:coverage     # Vitest suite with v8 coverage thresholds (85/85/80/85)
npm run test:transport    # stdio + HTTP/SSE integration verification (requires build)
```

## Architecture & Security Boundaries

- Acyclic layering: `lib/tools/` -> `lib/core/` -> `lib/shared/` (`lib/core/` never imports `lib/tools/`).
- Worker parity: `lib/shared/`, `lib/tools/`, `lib/core/`, and `lib/workers/` must remain free of `node:*` imports in Worker runtime paths.
- SSRF allowlists (`lib/config/index.ts`): `apidatalake.tesouro.gov.br`, `api.transferegov.gestao.gov.br`, `www.tesourotransparente.gov.br`, `tesourotransparente.gov.br` (HTTPS required outside dev/test loopback).
- PostgREST filter sanitization: strip `[,()*%\\]` from user-supplied text filters before building `ilike.*clean*` queries for Transferegov.
- Runtime Zod `.strict()` validation enforced centrally in `lib/core/registry.ts`.
- Outputs bounded via `serializeBoundedToolOutput` (`MCP_MAX_TOOL_OUTPUT_CHARS`, default `100000`) and external text sanitized via `sanitizeUntrustedText`.
