---
status: completed
run_id: RUN-20261121-180212-tck-0001
ticket: TCK-0001
design: DES-0001
start_time: 2026-11-21T18:02:12Z
end_time: 2026-11-21T18:23:42Z
environment: dev
mode: live
operator: ops
commits:
  - 4f36e2d5bd3e7df8fe93c64efa0b327346d7d0b7
files_modified:
  - README.md
  - PRIVACY.md
  - .archagents/00-overview.md
  - .archagents/01-business-domain.md
  - .archagents/02-architecture.md
  - .archagents/03-modules.md
  - .archagents/04-data-model.md
  - .archagents/05-integrations.md
  - .archagents/06-infra-devops.md
  - .archagents/07-security-compliance.md
  - .archagents/08-conventions.md
  - .archagents/10-runbooks.md
  - lib/adapters/cli-http.ts
  - lib/adapters/cli.ts
  - lib/adapters/cloudflare.ts
  - lib/bin/mcp-orcamento.ts
  - lib/config/index.ts
  - lib/config/timeouts.ts
  - lib/core/cache.ts
  - lib/core/http-client.ts
  - lib/core/mcp-server.ts
  - lib/core/registry.ts
  - lib/core/tool-schemas.ts
  - lib/core/tools.ts
  - lib/index.ts
  - lib/infrastructure/http/circuit-breaker.ts
  - lib/infrastructure/logger.ts
  - lib/infrastructure/rate-limiter.ts
  - lib/infrastructure/tracing.ts
  - lib/shared/agentic-guard.ts
  - lib/shared/compliance-notices.ts
  - lib/shared/errors.ts
  - lib/shared/log-redaction.ts
  - lib/shared/orcamento-schemas.ts
  - lib/shared/types/result.ts
  - lib/shared/utils/constants.ts
  - lib/shared/utils/timeout.ts
  - lib/tools/index.ts
  - lib/tools/siconfi.ts
  - lib/tools/tesouro.ts
  - lib/tools/transferegov.ts
  - lib/types/index.ts
  - lib/workers/auth.ts
  - lib/workers/oauth.ts
  - lib/workers/openapi.ts
  - lib/workers/rate-limit.ts
  - lib/workers/rest.ts
  - lib/workers/sse.ts
  - lib/workers/types.ts
  - lib/workers/worker.ts
  - test/integration/transports.mjs
  - test/unit/architecture-hygiene.test.ts
  - test/unit/cache-rate-limiter.test.ts
  - test/unit/cli-http-security.test.ts
  - test/unit/config-ssrf.test.ts
  - test/unit/http-client-circuit-breaker.test.ts
  - test/unit/mcp-server-handlers.test.ts
  - test/unit/observability-agentic-errors.test.ts
  - test/unit/siconfi-tools.test.ts
  - test/unit/tesouro-tools.test.ts
  - test/unit/tool-validation-allowlist.test.ts
  - test/unit/transferegov-tools.test.ts
  - test/unit/worker-auth-oauth-cors.test.ts
  - test/unit/worker-rest-cloudflare.test.ts
  - test/unit/worker-sse-kv.test.ts
test_result:
  status: pass
  summary: "14/14 unit suites (50/50 tests) + stdio/HTTP-SSE integration passed; coverage 91.68% stmts / 81.12% branches / 92.43% funcs / 92.25% lines"
  details: "Dual tsc builds, verify-tool-allowlist (0 violations), criteria-check (5/5 pass), check-scope (out_of_scope: []), and secret-scan clean"
---
# RUN-20261121-180212-tck-0001 - TCK-0001

## Resumo executivo

<!-- result:inicio — gerado a partir do result.json; o que está entre as marcas é regravado a cada drive -->
**Resultado de TCK-0001** (status do ticket: verifying) — `result.json` gerado em 2026-11-21T18:24:19Z, HEAD `4f36e2d5bd3e`

implementado ? · verificado ✗ · publicado ? (sem ref remota — nada a comparar)

| # | Estado | Atendido | ✓ evidência · ✗ falta · ? não medido |
|---|---|---|---|
| 1 | Pedido compreendido | ✓ | ✓ ticket em 'verifying' (saiu de raw) · ✓ acceptance[]: 5 critério(s) · ✓ restrições registradas: nenhuma · ? evento de rota: não liga a ticket nem a run (não medido) |
| 2 | Execução autorizada | ? | ✓ o ticket passou por executing (status 'verifying') · ✓ nenhuma restrição read-only · ? run sem drive (guiado à mão): o handoff do designed→executing não foi lido · ? budget.json ausente: sem teto de orçamento medido · ? max_attempts_total ausente no run: sem teto de tentativas medido |
| 3 | Tarefa executada | ? | ✓ 1 commit(s) citam o ticket · ? actions.jsonl: sem passos de iteração do driver |
| 4 | Requisito comprovado | ✗ | ✓ lock: passes true · ✓ lock fresh: o conteúdo é o que foi verificado · ✗ VER exigido (ver_required) e nenhum vinculado ao ticket |
| 5 | Publicação autorizada | ? | ✓ nenhuma restrição no-publish · ? run sem drive: a autonomia não foi registrada · ? sessão: as restrições da sessão não são conhecidas aqui (não medido) · ? URL de PR: não medida (sem rede) · ? autonomia concedida ao operador: não medida aqui (o nível do drive é o --level do ratchet, default L2) |

**Requisitos** (acceptance[]; o lock vale para o ticket inteiro):
- `npm run build && npm run build:worker` (esperado: ``) — lock passes ✓, fresh
- `node -e "import('./build/lib/core/tools.js').then(m => { const names = m.TOOL_DEFINITIONS.map(t => t.name); if (names.length !== 8) process.exit(1); console.log('TOOLS_OK:' + names.length); })"` (esperado: `TOOLS_OK:8`) — lock passes ✓, fresh
- `node -e "import('node:fs').then(fs => { const allow = JSON.parse(fs.readFileSync('.archagents/mcp-tool-allowlist.json','utf8')); const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.version !== '0.1.0' || allow.entries.length !== 8) process.exit(1); console.log('ALLOWLIST_AND_VERSION_OK'); })"` (esperado: `ALLOWLIST_AND_VERSION_OK`) — lock passes ✓, fresh
- `npx vitest run --coverage` (esperado: ``) — lock passes ✓, fresh
- `npm run test:transport` (esperado: ``) — lock passes ✓, fresh

**Pendências** (1):
- estado 4 (Requisito comprovado): VER exigido (ver_required) e nenhum vinculado ao ticket

**Não medido** (14):
- drive: run sem drive (guiado à mão)
- budget.json: ausente (sem teto de orçamento medido)
- actions.jsonl: sem passos de iteração do driver
- git: sem ref remota — nada a comparar
- run.json: sem max_attempts_total
- evento de rota: não liga a ticket nem a run (não medido)
- run sem drive (guiado à mão): o handoff do designed→executing não foi lido
- budget.json ausente: sem teto de orçamento medido
- max_attempts_total ausente no run: sem teto de tentativas medido
- run sem drive: a autonomia não foi registrada
- sessão: as restrições da sessão não são conhecidas aqui (não medido)
- URL de PR: não medida (sem rede)
- autonomia concedida ao operador: não medida aqui (o nível do drive é o --level do ratchet, default L2)
- publicado: sem ref remota — nada a comparar

**Consumo:** não medido (cost_source: unknown)

_O relatório descreve o instante em que foi gerado; quem decide é o ticket, o lock, o VER e o git._
<!-- result:fim -->

## Evidence Gate

| Check | Esperado | Obtido | Status |
|---|---|---|---|
| `npm run build && npm run build:worker` | exit 0 | exit 0 (`tsc` & `tsc -p tsconfig.worker.json`) | pass |
| `node -e "...TOOL_DEFINITIONS..."` | `TOOLS_OK:8` | `TOOLS_OK:8` | pass |
| `node -e "...allowlist & version..."` | `ALLOWLIST_AND_VERSION_OK` | `ALLOWLIST_AND_VERSION_OK` | pass |
| `npx vitest run --coverage` | exit 0 (>=85/85/80/85) | 14 files / 50 tests pass (`91.68%` stmts, `81.12%` branches, `92.43%` funcs, `92.25%` lines) | pass |
| `npm run test:transport` | exit 0 | `STDIO_TRANSPORT_OK` & `HTTP_SSE_TRANSPORT_OK` | pass |
| `verify-tool-allowlist.py --json` | `violations_count: 0` | `violations_count: 0` | pass |
| `check-scope.py --ticket TCK-0001 --base main` | `out_of_scope: []` | `out_of_scope: []`, `scope_tampered: []` | pass |
| `wc -l lib/core/mcp-server.ts` | `<= 180` | `147` lines | pass |
