# Segurança e limites

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`, `SPC-0001`).

- **SSRF:** allowlists HTTPS explícitas para Tesouro ORDS, Transferegov e Tesouro CKAN; loopback apenas em `NODE_ENV=development|test`, rejeição de credenciais embutidas na URL e validação de `.mcprc.json` e overrides.
- **Anti-injeção PostgREST:** filtros textuais (`nome_parlamentar`, `sigla_unidade`) removem `[,()*%\\]` antes de montar `ilike.*clean*`.
- **Validação agêntica (`SC-9`):** todas as 8 ferramentas usam Zod `.strict()` sem `api_key`, allowlist versionada em `.archagents/mcp-tool-allowlist.json` (`_capabilities.json` com `enabled: false`, `tool_count: 8`), sanitização `sanitizeUntrustedText`, aviso `UNTRUSTED_EXTERNAL_DATA_NOTICE`, teto `serializeBoundedToolOutput` e `lgpd_notice` (`HOMONYM_HUMAN_REVIEW_NOTICE`) em resultados com nomes parlamentares.
- **Auth & CORS:** `MCP_API_KEY` fail-closed fora de loopback no CLI HTTP e em rotas privadas do Worker; OAuth desabilitado fail-closed (`501`).

## Fontes

- `.archagents/_capabilities.json`
- `.archagents/mcp-tool-allowlist.json`
- `PRIVACY.md`
