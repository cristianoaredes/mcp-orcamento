---
id: DES-0001
slug: spc-0001-implementacao-inicial-mcp-orcamento-v0-1-0-8-tools-worker-safe-siconfi
title: "[SPC-0001] Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI/Transferegov/SADIPEM)"
created_at: 2026-11-21T18:00:31Z
status: approved
ticket: TCK-0001
type: design
scope_files_new:
  - lib/bin/mcp-orcamento.ts
  - lib/index.ts
  - lib/types/index.ts
  - lib/config/index.ts
  - lib/config/timeouts.ts
  - lib/core/cache.ts
  - lib/core/http-client.ts
  - lib/core/registry.ts
  - lib/core/tools.ts
  - lib/core/mcp-server.ts
  - lib/core/tool-schemas.ts
  - lib/infrastructure/logger.ts
  - lib/infrastructure/rate-limiter.ts
  - lib/infrastructure/tracing.ts
  - lib/infrastructure/http/circuit-breaker.ts
  - lib/shared/agentic-guard.ts
  - lib/shared/compliance-notices.ts
  - lib/shared/errors.ts
  - lib/shared/log-redaction.ts
  - lib/shared/orcamento-schemas.ts
  - lib/shared/types/result.ts
  - lib/shared/utils/constants.ts
  - lib/shared/utils/timeout.ts
  - lib/adapters/cli.ts
  - lib/adapters/cli-http.ts
  - lib/adapters/cloudflare.ts
  - lib/tools/siconfi.ts
  - lib/tools/transferegov.ts
  - lib/tools/tesouro.ts
  - lib/tools/index.ts
  - lib/workers/auth.ts
  - lib/workers/oauth.ts
  - lib/workers/rate-limit.ts
  - lib/workers/sse.ts
  - lib/workers/rest.ts
  - lib/workers/openapi.ts
  - lib/workers/types.ts
  - lib/workers/worker.ts
  - test/unit/architecture-hygiene.test.ts
  - test/unit/tool-validation-allowlist.test.ts
  - test/unit/siconfi-tools.test.ts
  - test/unit/transferegov-tools.test.ts
  - test/unit/tesouro-tools.test.ts
  - test/unit/config-ssrf.test.ts
  - test/unit/worker-rest-cloudflare.test.ts
  - test/unit/worker-auth-oauth-cors.test.ts
  - test/unit/worker-sse-kv.test.ts
  - test/unit/mcp-server-handlers.test.ts
  - test/unit/cli-http-security.test.ts
  - test/unit/http-client-circuit-breaker.test.ts
  - test/unit/cache-rate-limiter.test.ts
  - test/unit/observability-agentic-errors.test.ts
  - test/integration/transports.mjs
scope_files_modified:
  - README.md
  - PRIVACY.md
  - NOTICE.md
  - AGENTS.md
  - CLAUDE.md
  - .archagents/_capabilities.json
  - .archagents/mcp-tool-allowlist.json
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
scope_files_deleted: []
blast_radius: medium
playbook: .archagents/16-designs/playbooks/DES-0001-playbook.md
acceptance_delta: unchanged
---
# DES-0001 - [SPC-0001] Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI/Transferegov/SADIPEM)

## Problema

Instanciar o repositório `@aredes.me/mcp-orcamento` (`v0.1.0`, `AGPL-3.0-only`) a partir da base arquitetural endurecida do `mcp-dadosbr`, entregando 8 ferramentas read-only sem API key sobre APIs públicas orçamentárias brasileiras (SICONFI, Transferegov, SADIPEM/PVL e Tesouro Transparente CKAN) com paridade total entre Node.js (`stdio` / `HTTP+SSE`) e Cloudflare Workers.

## Solucao

1. **Adaptadores e Núcleo Compartilhado (Passo 1):**
   - Implementar `lib/types/index.ts`, `lib/config/{index,timeouts}.ts`, `lib/shared/{agentic-guard,compliance-notices,errors,log-redaction,types/result,utils/constants,utils/timeout}.ts`, `lib/infrastructure/{logger,rate-limiter,tracing,http/circuit-breaker}.ts`, `lib/core/{cache,http-client,registry,tools,mcp-server,tool-schemas}.ts`, `lib/adapters/{cli,cli-http,cloudflare}.ts`, `lib/bin/mcp-orcamento.ts`, `lib/index.ts` e `lib/workers/{auth,oauth,rate-limit,sse,rest,openapi,types,worker}.ts`.
   - Remover completamente `apps/`, `build-apps.mjs`, `smithery.ts`, `SequentialThinkingProcessor` e módulos CNPJ/CEP/OSINT/Tavily/DataJud.
   - Manter `lib/core/mcp-server.ts` com `<= 180` linhas, sem `node:fs`, `ListResources` vazio, `ReadResource` rejeitando `Unknown resource URI`, rate limit por sessão e `serializeBoundedToolOutput`.
   - Expor endpoint REST genérico `POST /tools/{toolName}` no Worker validando `hasTool(toolName)` (`404` desconhecida, `400` JSON inválido/encoding inválido) e encaminhando para `handleMCPRequest`, além de `/openapi.json` com enum das 8 tools.
2. **Catálogo de 8 Ferramentas Orçamentárias e Fiscais (Passo 2):**
   - `lib/shared/orcamento-schemas.ts`: schemas Zod `.strict()` sem `api_key` e sem imports `node:*`.
   - `lib/tools/siconfi.ts`: `siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf`, `siconfi_dca` com timeout de `15_000ms`, descoberta de `anexos_disponiveis`, filtragem/paginação (`<= 50`) e cache apenas de respostas válidas.
   - `lib/tools/transferegov.ts`: `transferegov_emendas_especiais` e `transferegov_fundo_a_fundo_ted` com mapeamento explícito de parâmetros PostgREST, sanitização `[,()*%\\]`, `.superRefine()` para pares `modalidade`/`recurso`, nota sobre exclusão de `/maisbrasil`/`/siconv`/`/obrasgov` e `lgpd_notice` quando houver nomes parlamentares.
   - `lib/tools/tesouro.ts`: `tesouro_operacoes_credito_ckan` (PVL SADIPEM exigindo `uf` de 2 letras e busca CKAN `package_search`).
   - `lib/tools/index.ts`: barrel de registro das 8 tools.
3. **Documentação e Governança `SC-9` (Passo 3):**
   - Atualizar `README.md`, `PRIVACY.md`, `NOTICE.md`, `AGENTS.md`, `CLAUDE.md` e `.archagents/*` com citações exatas de arquivos/linhas, `_capabilities.json` (`tool_count: 8`) e `.archagents/mcp-tool-allowlist.json` (`MCP-TOOL-01..08`).
4. **Suíte Unitária (>= 85% cobertura) e Integração de Transportes (Passo 4):**
   - Cobrir todas as 8 tools, SSRF, PostgREST sanitization, allowlist `SC-9`, CLI HTTP security, Worker REST/OpenAPI/Auth/OAuth/SSE/KV, circuit breaker, cache, tracing/logger e agentic guard em `test/unit/*.test.ts`.
   - Validar `stdio` (incluindo 101 chamadas offline em `siconfi_entes` com `{}` -> `isError: true`, zero `fetch`, `transportErrors` vazio) e `HTTP/SSE` em `test/integration/transports.mjs`.

## Threat Model

- **T1 — SSRF via env vars, `.mcprc.json` ou `resolveApiConfig(overrides)`:**
  - *Risco:* redirecionamento de `tesouroOrdsBaseUrl`, `transferegovBaseUrl` ou `tesouroCkanBaseUrl` para rede interna, metadata cloud (`169.254.169.254`) ou hosts externos não confiáveis, potencialmente vazando `authHeaders`.
  - *Controle:* `validateUrl()` em `lib/config/index.ts` impõe allowlists explícitas (`ALLOWED_TESOURO_ORDS_HOSTS`, `ALLOWED_TRANSFEREGOV_HOSTS`, `ALLOWED_TESOURO_CKAN_HOSTS`), exige `https:` fora de loopback, restringe loopback (`localhost`/`127.0.0.1`) exclusivamente a `NODE_ENV` `development|test`, rejeita credenciais embutidas e revalida `resolveApiConfig(overrides)`.
- **T2 — Injeção de operadores PostgREST (`transferegov_emendas_especiais`, `transferegov_fundo_a_fundo_ted`):**
  - *Risco:* parâmetros textuais como `nome_parlamentar` ou `sigla_unidade` contendo `,`, `(`, `)`, `*`, `%` ou `\` manipularem expressões PostgREST `or(...)`/`ilike`.
  - *Controle:* `sanitizePostgrestFilterTerm()` remove estritamente `[,()*%\\]` antes de montar `ilike.*clean*`, rejeitando filtros vazios pós-sanitização e validando enums/regex em Zod `.strict()`.
- **T3 — Prompt Injection & Payload DoS em respostas externas:**
  - *Risco:* strings retornadas por APIs públicas conterem caracteres de controle, tags falsificadas (`</untrusted_*>`) ou listas massivas de SICONFI/SADIPEM estourarem memória/contexto.
  - *Controle:* sanitização recursiva via `sanitizeUntrustedText`, anexo de `UNTRUSTED_EXTERNAL_DATA_NOTICE`, filtragem + paginação server-side (`<= 50`) antes da serialização e teto estrito `serializeBoundedToolOutput` (`MCP_MAX_TOOL_OUTPUT_CHARS`).
- **T4 — Risco de homônimos e decisão automatizada (LGPD Art. 20):**
  - *Risco:* correspondências nominais de parlamentares ou executores em `transferegov_emendas_especiais` gerarem falso positivo.
  - *Controle:* inclusão obrigatória de `lgpd_notice: HOMONYM_HUMAN_REVIEW_NOTICE` sempre que resultados envolverem nomes parlamentares (`plano_acao_especial` ou campos nominais), além de transparência em `PRIVACY.md` e `MCP_DPO_CONTACT`.
- **T5 — Exposição não autenticada, DNS rebinding e OAuth inseguro nos transportes HTTP/Worker:**
  - *Risco:* acesso não autorizado ao servidor HTTP local ou Worker, abuso de CORS ou token OAuth fictício.
  - *Controle:* CLI HTTP faz bind em `127.0.0.1`, exige `MCP_API_KEY` fail-closed fora de loopback, valida `Host`/`Origin` e usa comparação constant-time (`SHA-256` + `timingSafeEqual`); Worker exige `MCP_API_KEY` via `constantTimeEqual` em rotas não públicas, aplica CORS restritivo e mantém `/oauth/*` fail-closed (`501`).
- **T6 — Envenenamento de cache e falha em cascata de upstream:**
  - *Risco:* cachear respostas HTTP 4xx/5xx, payloads malformados ou listas vazias inválidas; travar o event loop em lentidão do SICONFI/SADIPEM.
  - *Controle:* timeout de `15_000ms` nas requisições ORDS, `CircuitBreaker` isolado por origem (`http-client.ts`) e gravação em `Cache` estritamente condicionada a sucesso HTTP (`ok: true`) com estrutura validada (e não-vazia em `siconfi_entes`/`pvl`).

## Mudancas

- Código-fonte (`lib/`): 38 arquivos novos conforme `scope_files_new` (sem `apps/`, `smithery.ts` ou imports `node:*` na camada Worker).
- Testes (`test/`): 14 suítes unitárias em `test/unit/*.test.ts` + integração dual-transport em `test/integration/transports.mjs`.
- Docs & Governança: `README.md`, `PRIVACY.md`, `NOTICE.md`, `AGENTS.md`, `CLAUDE.md` e `.archagents/*` atualizados para 8 tools `v0.1.0`.

## Criterios de sucesso

- [ ] `npm run build && npm run build:worker` e `npx tsc --noEmit && npx tsc -p tsconfig.worker.json --noEmit` passam sem erros.
- [ ] `TOOL_DEFINITIONS` e `.archagents/mcp-tool-allowlist.json` listam exatamente as 8 tools e `package.json` declara `0.1.0`.
- [ ] `npx vitest run --coverage` passa com thresholds >= 85% lines / 85% functions / 80% branches / 85% statements.
- [ ] `npm run test:transport` valida `stdio` (incl. 101 chamadas offline) e `HTTP/SSE`.
- [ ] `verify-tool-allowlist.py --json` retorna `violations_count: 0` e `secret-scan.sh` passa limpo.
