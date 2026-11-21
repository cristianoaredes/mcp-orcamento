# Contributing to MCP Orçamento

_Obrigado por seu interesse em contribuir! / Thank you for your interest in contributing!_

## 🌍 Languages / Idiomas

- [English](#english)
- [Português](#português)

---

## English

We welcome contributions from developers, civic-tech builders, and public-finance researchers! This guide covers our architecture, local verification, and pull request workflow.

### 🚀 Quick Start

Use Node.js **22.12+**, **24**, or **26** (`engines.node` in [`package.json`](package.json#L73-L75)).

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/mcp-orcamento.git`
3. **Install** dependencies: `npm ci`
4. **Build** Node & Worker targets: `npm run build && npm run build:worker`
5. **Run** tests and transport smoke checks: `npm test && npm run test:transport`

### 🏗️ Modular Architecture & Code Standards

Unlike single-file prototypes, **MCP Orçamento** uses a **strictly layered, acyclic modular TypeScript architecture** under `lib/` ([`ADR-0001`](.archagents/09-decisions/ADR-0001-dual-runtime-node-cloudflare-worker.md)):

- **`lib/bin/` & `lib/adapters/`**: CLI executable (`mcp-orcamento.ts`), `stdio` runner (`cli.ts`), hardened Express 5 HTTP/SSE & Streamable HTTP adapter (`cli-http.ts`), and stateless Cloudflare Worker bridge (`cloudflare.ts`).
- **`lib/config/`**: `.mcprc.json` + env resolution and SSRF host allowlists (`index.ts`), plus centralized timeouts (`timeouts.ts` — `15_000ms` ORDS / `8_000ms` HTTP).
- **`lib/core/`**: MCP server factory (`mcp-server.ts`, kept `<= 180` lines with zero `node:fs`), Zod-validated registry (`registry.ts`), RED metrics & tool runner (`tools.ts`), acyclic schema mirror (`tool-schemas.ts`), resilient HTTP client (`http-client.ts` with retry & per-origin circuit breaker), and LRU/KV cache (`cache.ts`).
- **`lib/infrastructure/`**: `stderr`-only JSON logger with redaction (`logger.ts`), Web Crypto request tracing (`tracing.ts`), sliding-window rate limiter (`rate-limiter.ts`), and per-origin circuit breaker (`http/circuit-breaker.ts`).
- **`lib/shared/`**: Strict Zod `.strict()` schemas (`orcamento-schemas.ts`), untrusted-data sanitization & bounded output (`agentic-guard.ts`), LGPD Art. 20 homonym notice (`compliance-notices.ts`), log redaction (`log-redaction.ts`), errors (`errors.ts`), and SSRF validation (`utils/constants.ts`).
- **`lib/tools/`**: Domain modules (`siconfi.ts`, `transferegov.ts`, `tesouro.ts`) and registration barrel (`index.ts`).
- **`lib/workers/`**: Cloudflare Worker entrypoint (`worker.ts`), generic REST `POST /tools/{toolName}` (`rest.ts`), OpenAPI 3.0.3 (`openapi.ts`), SSE with KV sessions (`sse.ts`), constant-time auth (`auth.ts`), OAuth fail-closed stubs (`oauth.ts`), and rate limiting (`rate-limit.ts`).

#### Architectural Invariants (enforced by CI & Vitest)

- **Zero `node:*` imports** in `lib/shared/`, `lib/tools/`, `lib/core/`, `lib/workers/`, and `lib/adapters/cloudflare.ts` (Cloudflare Workers parity).
- **Acyclic layering**: `lib/core/` must never import `lib/tools/` (except `lib/core/tools.ts`).
- **Concise server factory**: `lib/core/mcp-server.ts` must stay `<= 180` lines and free of `node:fs`.
- **`stdio` framing integrity**: never write to `stdout` outside JSON-RPC; all logs and `[metrics]` must go to `stderr`.
- **Agentic & SSRF safety**: keep Zod `.strict()` schemas with no `api_key` parameters, strip PostgREST operators `[,()*%\\]` in text filters, enforce SSRF host allowlists, and keep `.archagents/mcp-tool-allowlist.json` aligned.

#### Verification Commands

- `npx tsc --noEmit && npx tsc -p tsconfig.worker.json --noEmit` — type-check both Node (`Node16`) and Worker (`Bundler`) targets
- `npm test` — run Vitest unit suites (`test/unit/*.test.ts`)
- `npm run test:coverage` — enforce v8 coverage thresholds (`85%` lines / `85%` functions / `80%` branches / `85%` statements)
- `npm run build && npm run build:worker` — compile CLI and Cloudflare Worker (`build/lib/workers/worker.js` < 1 MB)
- `npm run test:transport` — verify `stdio` (including 101 consecutive offline calls), Streamable HTTP (`/mcp`), and legacy SSE (`/sse` + `/messages`)

### 🔧 Development Process & `.archagents/` Governance

We use a **`main` + feature-branch PR workflow** governed by **Codebase OPS** ([`.archagents/README.md`](.archagents/README.md)):

1. **Check or open an issue** (or governed ticket in `.archagents/15-backlog/`) to discuss scope and boundaries.
2. **Fork and branch from `main`**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature-name   # or fix/..., docs/..., chore/...
   ```
3. **Implement & test**: Follow the modular layer rules, keep `lib/core/mcp-server.ts <= 180` lines, and verify `npm run test:coverage` and `npm run test:transport`.
4. **Update governance & docs**: Keep `README.md`, `PRIVACY.md`, `.archagents/mcp-tool-allowlist.json`, and `.archagents/` artifacts synchronized when contracts or tools change.
5. **Submit a Pull Request targeting `main`** with conventional commits and verification evidence.

### 📝 Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
feat(siconfi): add fiscal indicator filter to siconfi_rreo
fix(transferegov): sanitize extra PostgREST operator in text filter
docs(readme): expand Orqo editorial documentation and .mcprc.example.json
test(worker): cover malformed URI decoding on /tools/:toolName
```

### 🐛 Bug Reports

When opening an issue, please include:

1. **Environment**: Node.js version, OS, transport (`stdio`, `http`, or Cloudflare Worker), and MCP client
2. **Steps to reproduce**: Exact tool name and arguments (redact any private API keys)
3. **Expected vs. actual behavior**: Including `isError`, HTTP status, or `source.url`
4. **Logs & configuration**: Relevant `stderr` JSON logs and `.mcprc.json` / env vars (without secrets)

---

## Português

Damos as boas-vindas a contribuições de desenvolvedores, pesquisadores de finanças públicas e construtores de tecnologia cívica! Este guia explica a arquitetura, a suíte de verificação e o fluxo de pull requests.

### 🚀 Início Rápido

Use Node.js **22.12+**, **24** ou **26** (`engines.node` em [`package.json`](package.json#L73-L75)).

1. **Faça um fork** do repositório
2. **Clone** seu fork: `git clone https://github.com/seu-usuario/mcp-orcamento.git`
3. **Instale** as dependências: `npm ci`
4. **Compile** os alvos Node e Worker: `npm run build && npm run build:worker`
5. **Execute** testes e verificação de transportes: `npm test && npm run test:transport`

### 🏗️ Arquitetura Modular e Padrões de Código

O **MCP Orçamento** adota uma **arquitetura TypeScript modular em camadas acíclicas** sob `lib/` ([`ADR-0001`](.archagents/09-decisions/ADR-0001-dual-runtime-node-cloudflare-worker.md)):

- **`lib/bin/` e `lib/adapters/`**: entrypoint executável (`mcp-orcamento.ts`), CLI `stdio` (`cli.ts`), servidor Express 5 HTTP/SSE e Streamable HTTP endurecido (`cli-http.ts`) e adaptador *stateless* para Cloudflare Workers (`cloudflare.ts`).
- **`lib/config/`**: carregamento de `.mcprc.json` + variáveis de ambiente com allowlist SSRF (`index.ts`) e timeouts centralizados (`timeouts.ts` — `15_000ms` ORDS / `8_000ms` HTTP).
- **`lib/core/`**: fábrica do servidor MCP (`mcp-server.ts`, mantida `<= 180` linhas e sem `node:fs`), registro com validação Zod (`registry.ts`), métricas RED (`tools.ts`), espelho acíclico de schemas (`tool-schemas.ts`), cliente HTTP com retry e circuit breaker por origem (`http-client.ts`) e cache LRU/KV (`cache.ts`).
- **`lib/infrastructure/`**: logger JSON em `stderr` com redação (`logger.ts`), correlação `X-Request-Id` via Web Crypto (`tracing.ts`), rate limiter em janela deslizante (`rate-limiter.ts`) e circuit breaker (`http/circuit-breaker.ts`).
- **`lib/shared/`**: schemas Zod `.strict()` (`orcamento-schemas.ts`), guarda agêntico e truncamento seguro (`agentic-guard.ts`), aviso LGPD Art. 20 contra homônimos (`compliance-notices.ts`), redação de logs (`log-redaction.ts`), erros (`errors.ts`) e validação SSRF (`utils/constants.ts`).
- **`lib/tools/`**: módulos de domínio (`siconfi.ts`, `transferegov.ts`, `tesouro.ts`) e registro central (`index.ts`).
- **`lib/workers/`**: roteador do Worker (`worker.ts`), REST genérico `POST /tools/{toolName}` (`rest.ts`), OpenAPI 3.0.3 (`openapi.ts`), SSE com sessão KV (`sse.ts`), autenticação em tempo constante (`auth.ts`), stubs OAuth fail-closed (`oauth.ts`) e rate limit KV (`rate-limit.ts`).

#### Invariantes Arquiteturais (garantidas por CI e Vitest)

- **Zero imports `node:*`** em `lib/shared/`, `lib/tools/`, `lib/core/`, `lib/workers/` e `lib/adapters/cloudflare.ts` (paridade com Cloudflare Workers).
- **Camadas acíclicas**: `lib/core/` nunca importa `lib/tools/` (exceto `lib/core/tools.ts`).
- **Fábrica concisa**: `lib/core/mcp-server.ts` deve permanecer com `<= 180` linhas e sem `node:fs`.
- **Integridade do `stdio`**: nunca escreva em `stdout` fora de quadros JSON-RPC; todos os logs e `[metrics]` vão exclusivamente para `stderr`.
- **Segurança agêntica e SSRF**: mantenha schemas Zod `.strict()` sem parâmetro `api_key`, sanitização de operadores PostgREST `[,()*%\\]`, allowlists de host HTTPS e sincronia com `.archagents/mcp-tool-allowlist.json`.

#### Comandos de Verificação

- `npx tsc --noEmit && npx tsc -p tsconfig.worker.json --noEmit` — checa tipos nos alvos Node (`Node16`) e Worker (`Bundler`)
- `npm test` — executa a suíte unitária no Vitest (`test/unit/*.test.ts`)
- `npm run test:coverage` — valida cobertura mínima (`85%` linhas / `85%` funções / `80%` branches / `85%` statements)
- `npm run build && npm run build:worker` — compila CLI e Cloudflare Worker (`build/lib/workers/worker.js` < 1 MB)
- `npm run test:transport` — valida `stdio` (incluindo 101 chamadas offline consecutivas), Streamable HTTP (`/mcp`) e SSE legado (`/sse` + `/messages`)

### 🔧 Fluxo de Desenvolvimento e Governança `.archagents/`

Seguimos o fluxo **`main` + branches de feature/fix/docs via Pull Request**, com rastreabilidade pelo **Codebase OPS** ([`.archagents/README.md`](.archagents/README.md)):

1. **Verifique ou abra uma issue** (ou ticket em `.archagents/15-backlog/`) para alinhar escopo e critérios de aceite.
2. **Faça fork e crie uma branch a partir de `main`**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/nome-da-funcionalidade   # ou fix/..., docs/..., chore/...
   ```
3. **Desenvolva e valide**: respeite os limites modulares, mantenha `lib/core/mcp-server.ts <= 180` linhas e rode `npm run test:coverage` e `npm run test:transport`.
4. **Mantenha documentação e governança em dia**: atualize `README.md`, `PRIVACY.md`, `.archagents/mcp-tool-allowlist.json` e `.archagents/` quando houver mudanças de contrato ou catálogo.
5. **Abra um Pull Request para `main`** com commits convencionais e evidências dos testes executados.

### 📝 Mensagens de Commit

Use o padrão [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(siconfi): adicionar filtro por indicador fiscal no siconfi_rreo
fix(transferegov): sanitizar operador PostgREST em filtro textual
docs(readme): expandir README no padrão Orqo e adicionar .mcprc.example.json
test(worker): cobrir URI malformada em /tools/:toolName
```

### 🐛 Relatórios de Bug

Ao abrir uma issue, informe:

1. **Ambiente**: versão do Node.js, sistema operacional, transporte (`stdio`, `http` ou Cloudflare Worker) e cliente MCP
2. **Passos para reproduzir**: nome da ferramenta e argumentos usados (remova chaves privadas)
3. **Comportamento esperado vs. obtido**: status `isError`, código HTTP ou `source.url`
4. **Logs e configuração**: logs JSON do `stderr` e `.mcprc.json` / variáveis de ambiente (sem segredos)

---

**Obrigado por contribuir com dados fiscais e orçamentários abertos no Brasil! 🇧🇷**
**Thank you for helping make Brazilian public budget data more accessible! 🇧🇷**
