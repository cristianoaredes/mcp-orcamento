# Segurança e limites

Base atual: `TCK-0001` (`v0.1.0`, `SPC-0001`, implementado).

- **SSRF:** allowlists HTTPS explícitas para Tesouro ORDS, Transferegov e Tesouro CKAN (`lib/shared/utils/constants.ts`, re-exportadas por `lib/config/index.ts`); loopback apenas em `NODE_ENV=development|test` (ou `allowLoopback: true`), rejeição de credenciais embutidas na URL e validação de `.mcprc.json` e overrides.
- **Anti-injeção PostgREST:** filtros textuais (`nome_parlamentar`, `sigla_unidade`) removem `[,()*%\\]` antes de montar `ilike.*clean*`.
- **Validação agêntica (`SC-9`):** todas as 8 ferramentas usam Zod `.strict()` sem `api_key`, allowlist versionada em `.archagents/mcp-tool-allowlist.json` (`_capabilities.json` com `enabled: false`, `tool_count: 8`), sanitização `sanitizeUntrustedText`, aviso `UNTRUSTED_EXTERNAL_DATA_NOTICE`, teto `serializeBoundedToolOutput` e `lgpd_notice` (`HOMONYM_HUMAN_REVIEW_NOTICE`) em resultados com nomes parlamentares.
- **Auth, DNS Rebinding & CORS:** `cli-http.ts` faz bind padrão em `127.0.0.1`, valida cabeçalho `Host`, aplica allowlist estrita de `Origin` e exige `MCP_API_KEY`/`API_KEY` (comparação em tempo constante) quando configurada; no Worker (`lib/workers/auth.ts`), `MCP_REQUIRE_AUTH=true` opera fail-closed (`401`) se nenhuma chave estiver provisionada e OAuth não configurado retorna `501`.

## Fontes

- `.archagents/_capabilities.json`
- `.archagents/mcp-tool-allowlist.json`
- `PRIVACY.md`
