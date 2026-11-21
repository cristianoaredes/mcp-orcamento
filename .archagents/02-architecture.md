# Arquitetura AS-IS

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`, `ADR-0001`).

Arquitetura dual-runtime herdada do molde `mcp-dadosbr`:
- **Node.js CLI (`lib/bin/mcp-orcamento.ts` -> `lib/adapters/cli.ts`, `cli-http.ts`):** transportes `stdio` e `HTTP/SSE`, métricas e logs JSON exclusivamente em `stderr`, `MemoryCache`, `RateLimiter` e `createGracefulShutdown`.
- **Cloudflare Workers (`lib/adapters/cloudflare.ts` -> `lib/workers/*`):** runtime serverless *stateless* sem imports `node:*` na camada core/shared/tools/workers, cache/rate-limit em KV, REST genérico `POST /tools/{toolName}` e OpenAPI 3.0.
- **Camada acíclica (`lib/tools/` -> `lib/core/` -> `lib/shared/`):** `lib/core/` não importa `lib/tools/`.

```mermaid
flowchart LR
  H[Host MCP / Cliente HTTP] --> C[CLI Node stdio ou HTTP/SSE]
  H --> W[Cloudflare Worker]
  C --> M[lib/core/mcp-server.ts]
  M --> R[lib/core/registry.ts + lib/core/tools.ts]
  W --> R
  R --> T[lib/tools/siconfi, transferegov, tesouro]
  T --> HC[lib/core/http-client.ts + CircuitBreaker]
```

## Fontes

- `.archagents/09-decisions/ADR-0001-dual-runtime-node-cloudflare-worker.md`
- `tsconfig.json`
- `tsconfig.worker.json`
