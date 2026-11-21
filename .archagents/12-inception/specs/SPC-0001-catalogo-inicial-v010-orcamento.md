---
id: SPC-0001
slug: catalogo-inicial-v010-orcamento
title: "Implementação inicial mcp-orcamento v0.1.0 (8 tools Worker-safe SICONFI, Transferegov e SADIPEM/CKAN)"
created_at: "2026-11-21T14:33:08-03:00"
status: compiled
linked_brief: BRF-0001
linked_discovery: DSC-0001
module_of: null
approved_by: "cristiano 2026-11-21T14:33:08-03:00"
linked_tickets:
  - TCK-0001
external_refs: []
external_sync: []
effort: M
security_sensitive: true
acceptance:
  - check: "npm run build && npm run build:worker"
  - check: "node -e \"import('./build/lib/core/tools.js').then(m => { const names = m.TOOL_DEFINITIONS.map(t => t.name); if (names.length !== 8) process.exit(1); console.log('TOOLS_OK:' + names.length); })\""
    expect: "TOOLS_OK:8"
  - check: "node -e \"import('node:fs').then(fs => { const allow = JSON.parse(fs.readFileSync('.archagents/mcp-tool-allowlist.json','utf8')); const pkg = JSON.parse(fs.readFileSync('package.json','utf8')); if (pkg.version !== '0.1.0' || allow.entries.length !== 8) process.exit(1); console.log('ALLOWLIST_AND_VERSION_OK'); })\""
    expect: "ALLOWLIST_AND_VERSION_OK"
  - check: "npx vitest run --coverage"
  - check: "npm run test:transport"
---

# SPC-0001 — Implementação inicial `mcp-orcamento` `v0.1.0` (8 tools Worker-safe SICONFI, Transferegov e SADIPEM/CKAN)

## Problema

O ecossistema `@aredes.me/*` necessita de um servidor MCP dedicado (`@aredes.me/mcp-orcamento`, `v0.1.0`, `AGPL-3.0-only`) para consultas fiscais e orçamentárias públicas brasileiras (SICONFI, Transferegov, SADIPEM/PVL e Tesouro Transparente CKAN), clonando de forma enxuta a arquitetura endurecida dual-runtime (`Node.js stdio/HTTP+SSE` + `Cloudflare Workers`) do `mcp-dadosbr`, sem carregar MCP Apps HTML, módulos legados de CNPJ/CEP/OSINT ou chaves de busca pagas.

## Solução proposta

1. **Núcleo dual-runtime enxuto e acíclico (`ADR-0001`):**
   - `lib/config/index.ts` com allowlists SSRF exclusivas para `apidatalake.tesouro.gov.br`, `api.transferegov.gestao.gov.br` e `www.tesourotransparente.gov.br` / `tesourotransparente.gov.br`, validação de `.mcprc.json` e `resolveApiConfig(overrides)` com loopback restrito a `development|test`.
   - `lib/core/mcp-server.ts` (`<= 180` linhas, sem `node:fs`), `lib/core/registry.ts`, `lib/core/tools.ts`, `lib/core/tool-schemas.ts` (sem ciclo `core -> tools`), `lib/core/http-client.ts`, `lib/core/cache.ts`.
   - Adaptadores `lib/adapters/{cli.ts,cli-http.ts,cloudflare.ts}` e rotas Cloudflare Worker `lib/workers/{worker.ts,rest.ts,openapi.ts,sse.ts,auth.ts,oauth.ts,rate-limit.ts,types.ts}` com endpoint genérico `POST /tools/{toolName}` e OpenAPI 3.0 das 8 ferramentas.
2. **Catálogo inicial de 8 ferramentas read-only sem API key (`lib/shared/orcamento-schemas.ts`, `lib/tools/{siconfi,transferegov,tesouro,index}.ts`):**
   - `siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf`, `siconfi_dca` (`15_000ms` timeout, descoberta de `anexos_disponiveis`, paginação `<= 50`, cache apenas de respostas válidas não-vazias em listas).
   - `transferegov_emendas_especiais` e `transferegov_fundo_a_fundo_ted` (mapeamento explícito por `recurso`/`modalidade`, sanitização anti-injeção PostgREST removendo `[,()*%\\]`, exclusão documentada de `/maisbrasil`/`/siconv`/`/obrasgov`, e `lgpd_notice` quando há nomes parlamentares).
   - `tesouro_operacoes_credito_ckan` (PVL SADIPEM exigindo `uf` de 2 letras e busca CKAN `package_search`).
3. **Qualidade, segurança agêntica e cobertura:**
   - Schemas Zod `.strict()`, zero `api_key`, zero `node:*` em `lib/shared/`, `lib/tools/`, `lib/core/` e `lib/workers/`, sanitização via `sanitizeUntrustedText`, `UNTRUSTED_EXTERNAL_DATA_NOTICE`, `serializeBoundedToolOutput`, suítes Vitest com cobertura >= 85/85/80/85 e integração `npm run test:transport` (`stdio` com 101 chamadas offline + `HTTP/SSE`).

## Não-escopo

- Rotas Transferegov `/maisbrasil` e `/siconv` (HTTP 404 na origem) e `/obrasgov` (timeout >10s).
- MCP Apps HTML (`apps/`, `scripts/build-apps.mjs`) ou adaptador Smithery.
- Ferramentas de CNPJ/CEP/OSINT/DataJud/Tavily do `mcp-dadosbr`.
- Deploy real em Cloudflare Workers (`wrangler deploy`), criação de repo remoto (`gh repo create`) ou publicação npm (`npm publish`).

## Riscos

- Payloads volumosos de SICONFI (`entes`, `rreo`, `rgf`, `dca`) e SADIPEM (`pvl`) excederem o teto de contexto ou RAM do Worker → mitigação: timeout explícito de `15_000ms`, filtragem e paginação server-side (`<= 50` itens) antes de `serializeBoundedToolOutput` e cache apenas de respostas válidas.
- Tentativa de injeção de operadores PostgREST em filtros textuais do Transferegov (`nome_parlamentar`, `sigla_unidade`) ou SSRF via env/config → mitigação: stripping estrito de `[,()*%\\]` antes de montar `ilike.*clean*` e validação de hosts allowlisted em `validateUrl()`.
- Homônimos em consultas nominais parlamentares no Transferegov (LGPD Art. 20) → mitigação: anexar `lgpd_notice: HOMONYM_HUMAN_REVIEW_NOTICE` sempre que houver nomes parlamentares nos parâmetros/resultados.
- Cachear falhas HTTP ou respostas malformadas da origem → mitigação: validar estrutura (`Array`/objeto esperado) e status antes de gravar em `Cache`, nunca cacheando erros ou respostas vazias inválidas.

## Spec self-review

- Placeholder scan: ok — zero placeholders angulares ou campos pendentes na especificação.
- Consistência interna: ok — catálogo exato de 8 ferramentas e versão `0.1.0` alinhados entre frontmatter, `acceptance`, `mcp-tool-allowlist.json` e solução proposta.
- Escopo focado: ok — esforço `M` restrito ao servidor `mcp-orcamento` com exclusão explícita de MCP Apps, Smithery, `/maisbrasil`, `/siconv` e `/obrasgov`.
- Ambiguidades restantes: nenhuma — contratos de entrada, rotas upstream e limites de segurança definidos em `DSC-0001` e `BRF-0001`.
