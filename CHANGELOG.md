# Changelog

All notable changes to `@aredes.me/mcp-orcamento` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Distribuição (`2026-11-23`):** O pacote [`@aredes.me/mcp-orcamento`](https://www.npmjs.com/package/@aredes.me/mcp-orcamento) (`0.1.0`) está publicado no registro npm (`latest: 0.1.0`; tag GitHub Release `v0.1.0` pendente do merge do PR #1).

## [Unreleased]

### Added

- (`TCK-0003`) Suite de documentação técnica e SEO/GEO no padrão Orqo / `mcp-dadosbr`:
  - `docs/README.md`, `docs/CONFIGURATION.md`, `docs/MCP_CLIENT_INTEGRATION.md`, `docs/USAGE_EXAMPLES.md` (com exemplos obtidos em chamadas reais de `stdio` às APIs oficiais) e `docs/pt-br/README.md`.
  - `llms.txt` no formato `llmstxt.org` na raiz do repositório para indexação por buscadores e assistentes de IA.
  - `CHANGELOG.md` estruturado a partir dos commits e tickets do repositório.

### Changed

- (`TCK-0003`) Auditoria completa do `README.md` contra o código em `lib/` e alinhamento pós-publicação `v0.1.0` no npm: precisão de esquemas Zod (`siconfi_entes`, `siconfi_rgf`, formatação de CNPJ no Transferegov vs SICONFI, `cod_ibge` em `tesouro_operacoes_credito_ckan`), distinção entre `MCP_HTTP_TIMEOUT`, `MCP_ORDS_TIMEOUT` e `MCP_API_TIMEOUT`, `CORS_ALLOWED_ORIGINS` vs `MCP_CORS_ALLOWED_ORIGINS` e seção FAQ expandida para SEO/GEO.
- (`TCK-0003`) Revisados `description` e `keywords` em `package.json` e topics no GitHub (`emendas-parlamentares`, `lrf`, `dados-abertos`).

## [0.1.0] - 2026-11-21

### Added

- (`TCK-0001` / `SPC-0001` / `DES-0001`) Catálogo inicial de **8 ferramentas somente leitura** sem exigência de chave de API (`zero-key`) e com paridade entre Node.js CLI e Cloudflare Workers (`ADR-0001`):
  - **STN / SICONFI ORDS (5):** `siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf`, `siconfi_dca` com descoberta automática de `anexos_disponiveis`, filtro local por conta e paginação (`<= 50` itens; `<= 100` em `siconfi_extrato_entregas`).
  - **MGI / Transferegov PostgREST (2):** `transferegov_emendas_especiais` (Emendas Pix / Art. 166-A) e `transferegov_fundo_a_fundo_ted` com sanitização de operadores PostgREST (`[,()*%\\]`), escopo documentado (`api_scope_note`) e aviso LGPD Art. 20 (`lgpd_notice` / `HOMONYM_HUMAN_REVIEW_NOTICE`).
  - **STN / SADIPEM & Tesouro Transparente CKAN (1):** `tesouro_operacoes_credito_ckan` para pedidos de operação de crédito (`operacoes_credito_pvl`) e descoberta de datasets CKAN (`ckan_datasets`).
- Transportes `stdio`, Streamable HTTP (`ALL /mcp`), SSE legado (`GET /sse` + `POST /messages`) e adaptador Cloudflare Workers (`POST /mcp`, `/sse`, REST `POST /tools/{toolName}`, `GET /openapi.json`, `GET /health` e metadados OAuth RFC 8414/9728).
- (`TCK-0002`) Padronização inicial do `README.md` no formato Orqo/`mcp-dadosbr`, criação de `CONTRIBUTING.md`, `.mcprc.example.json`, `PRIVACY.md` e `NOTICE.md` sob licença `AGPL-3.0-only`.

### Security

- (`TCK-0001` / `VER-20261121-183924-tck-0001`) Hardening de produção validado em verificação independente P10:
  - Modo `cli-http.ts` fail-closed fora de loopback (recusa iniciar sem `MCP_API_KEY`/`API_KEY`), comparação de chave via SHA-256 + `timingSafeEqual` e proteção contra DNS rebinding (`MCP_ALLOWED_HOSTS`).
  - Allowlists SSRF HTTPS por origem (`apidatalake.tesouro.gov.br`, `api.transferegov.gestao.gov.br`, `www.tesourotransparente.gov.br`, `tesourotransparente.gov.br`), bloqueio de redirects automáticos (`redirect: "error"`), sanitização recursiva de texto externo (`untrusted_data_notice`), rejeição de URI malformada (`400`) e validação `nr_periodo <= 2` para RGF semestral.
