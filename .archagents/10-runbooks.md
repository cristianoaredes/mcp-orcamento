# Operação local

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`).

Execute `npm install`, `npm run build`, `npm run build:worker`, `npx tsc --noEmit`, `npx tsc -p tsconfig.worker.json --noEmit`, `npm run test:coverage` e `npm run test:transport`.

## Observabilidade e Logs

- **Logs JSON em `stderr` (`lib/infrastructure/logger.ts`):** todos os níveis escrevem exclusivamente via `console.error`, mantendo `stdout` reservado para JSON-RPC no transporte `stdio`.
- **Correlação `X-Request-Id` (`lib/infrastructure/tracing.ts`):** Web Crypto (`globalThis.crypto.randomUUID()` / `getRandomValues()`), propagação por `AsyncLocalStorage` no CLI HTTP e por `RequestContext` no Worker.
- **Health check (`GET /health`):** sonda opcional com timeout de `1000ms` sobre `MCP_CACHE` / `MCP_KV`, retornando `200` (`healthy`) ou `503` (`degraded`).

## Resposta a Incidentes e Notificação à ANPD (LGPD Art. 48)

Em caso de incidente envolvendo credenciais (`MCP_API_KEY`) ou exposição indevida de dados nominais consultados via `transferegov_emendas_especiais`:
1. **Triagem (T0 — até 2h):** registrar timestamp UTC, componente afetado, `X-Request-Id` e acionar o DPO (`MCP_DPO_CONTACT`).
2. **Contenção:** rotacionar `MCP_API_KEY` via `wrangler secret put`, purgar chaves afetadas em `MCP_CACHE`/`MCP_KV` e restringir `MCP_ALLOWED_ORIGINS`.
3. **Preservação & Avaliação (Resolução CD/ANPD nº 15/2024):** preservar logs com redação de PII e avaliar risco/dano aos titulares para notificação à ANPD e aos titulares em até 3 dias úteis quando aplicável.
