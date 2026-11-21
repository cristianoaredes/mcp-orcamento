# Convenções

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`).

- ESM (`"type": "module"`), TypeScript estrito (`Node16` para CLI/Node e `Bundler`/`ESNext` para Cloudflare Worker), Vitest com cobertura v8 (`85% lines / 85% functions / 80% branches / 85% statements`).
- As 8 ferramentas usam nomes em `snake_case`, zero parâmetros `api_key` e zero imports `node:*` em `lib/shared/`, `lib/tools/`, `lib/core/` e `lib/workers/`.
- No transporte `stdio`, `stdout` é exclusivo para JSON-RPC; logs e métricas `[metrics]` vão exclusivamente para `stderr`.

## Fontes

- `package.json`
- `vitest.config.ts`
- `tsconfig.json`
- `tsconfig.worker.json`
