# Mapa de módulos

Base atual: `TCK-0001` (`v0.1.0`, `SPC-0001`, implementado).

- `lib/bin/` e `lib/adapters/`: entrypoint CLI (`mcp-orcamento.ts`), CLI (`cli.ts`), HTTP+SSE endurecido (`cli-http.ts`) e adaptador Cloudflare Worker (`cloudflare.ts`).
- `lib/config/`: allowlists SSRF e resolução hierárquica de URLs (`index.ts`) e timeouts centralizados (`timeouts.ts`).
- `lib/core/`: servidor MCP sem `node:fs` (`mcp-server.ts`), registry com Zod runtime (`registry.ts`), orquestração e métricas RED (`tools.ts`), schemas espelhados sem ciclo (`tool-schemas.ts`), cliente HTTP com retry/circuit breaker (`http-client.ts`) e cache (`cache.ts`).
- `lib/infrastructure/`: logger `stderr` (`logger.ts`), tracing Web Crypto (`tracing.ts`), rate limiter (`rate-limiter.ts`) e circuit breaker (`http/circuit-breaker.ts`).
- `lib/shared/`: schemas Zod `.strict()` (`orcamento-schemas.ts`), guarda agêntico (`agentic-guard.ts`), avisos LGPD (`compliance-notices.ts`), redação de logs (`log-redaction.ts`), erros JSON-RPC (`errors.ts`), `Result` (`types/result.ts`), utilitários (`utils/constants.ts`, `utils/timeout.ts`).
- `lib/tools/`: módulos de domínio (`siconfi.ts`, `transferegov.ts`, `tesouro.ts`) e barrel de registro (`index.ts`).
- `lib/workers/`: roteador (`worker.ts`), REST genérico (`rest.ts`), OpenAPI 3.0 (`openapi.ts`), SSE (`sse.ts`), auth fail-closed (`auth.ts`), OAuth fail-closed (`oauth.ts`), rate limit KV (`rate-limit.ts`) e tipos (`types.ts`).

## Fontes

- `tsconfig.json`
- `tsconfig.worker.json`
