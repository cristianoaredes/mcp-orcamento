# Guia de Configuração — MCP Orçamento

_Referência técnica de variáveis de ambiente, `.mcprc.json`, timeouts diferenciados, segurança HTTP/Worker e allowlists SSRF no `@aredes.me/mcp-orcamento` (`0.1.0`)._

## Índice

- [Padrões de Inicialização](#padrões-de-inicialização)
- [Hierarquia de Configuração](#hierarquia-de-configuração)
- [Variáveis de Ambiente (Referência Completa)](#variáveis-de-ambiente-referência-completa)
- [Arquivo `.mcprc.json` e Allowlists SSRF](#arquivo-mcprcjson-e-allowlists-ssrf)
- [Modos de Transporte (Node.js)](#modos-de-transporte-nodejs)
- [Cloudflare Workers](#cloudflare-workers)
- [Diagnóstico Rápido](#diagnóstico-rápido)

---

## Padrões de Inicialização

Sem nenhuma configuração adicional, o MCP Orçamento inicializa com:

```text
APIs padrão:
  Tesouro ORDS (SICONFI/SADIPEM): https://apidatalake.tesouro.gov.br/ords/
  Transferegov (MGI PostgREST):  https://api.transferegov.gestao.gov.br/
  Tesouro Transparente (CKAN):   https://www.tesourotransparente.gov.br/ckan/api/3/action/

Transporte CLI padrão: stdio (bind HTTP padrão: 127.0.0.1:3000)
Cache LRU em memória: 256 entradas, TTL de 3.600.000 ms (1 hora) no Node.js (60.000 ms padrão no wrangler.toml; KV impõe mínimo de 60s)
Timeouts HTTP: 15.000 ms para ORDS (SICONFI/SADIPEM) | 8.000 ms para Transferegov/CKAN
Circuit Breaker por origem: 5 falhas consecutivas, recuperação em 30.000 ms (4xx não abre circuito)
Retry HTTP: 2 tentativas extras (backoff exponencial com equal jitter a partir de 250 ms em 429/5xx/timeouts)
Teto de saída: 100.000 caracteres por ferramenta (mínimo configurável: 1.024)
```

---

## Hierarquia de Configuração

No runtime Node.js ([`lib/config/index.ts`](../lib/config/index.ts)), a ordem de precedência é:

1. **Parâmetros explícitos em código (`overrides`)**
2. **Variáveis de ambiente (`TESOURO_ORDS_BASE_URL`, `TRANSFEREGOV_BASE_URL`, `TESOURO_CKAN_BASE_URL`, `API_KEY_HEADER`/`API_KEY_VALUE`)**
3. **Arquivo `.mcprc.json`:** `MCPRC_PATH` > `./.mcprc.json` (diretório atual) > `~/.mcprc.json`
4. **Constantes padrão oficiais** definidas em [`lib/shared/utils/constants.ts`](../lib/shared/utils/constants.ts)

---

## Variáveis de Ambiente (Referência Completa)

### Transporte e Segurança HTTP (`lib/adapters/cli-http.ts`)

| Variável | Padrão | Escopo | Descrição |
|---|---|---|---|
| `MCP_TRANSPORT` | `stdio` | CLI Node | Define o modo de transporte: `stdio` ou `http` (Streamable HTTP + SSE legado). |
| `MCP_HTTP_PORT` | `3000` (`8787` Worker) | CLI / Worker | Porta TCP no modo HTTP. Valores fora de `1..65535` recaem para `3000`. |
| `MCP_HTTP_HOST` | `127.0.0.1` | CLI HTTP | Endereço de bind. Qualquer host não-loopback (`0.0.0.0`, `::`, IP de rede) **exige** `MCP_API_KEY` ou `API_KEY` (comportamento fail-closed). |
| `MCP_API_KEY` / `API_KEY` | *(nenhum)* | CLI HTTP / Worker | Chave verificada via `Authorization: Bearer <chave>` ou `X-API-Key: <chave>` usando SHA-256 + `timingSafeEqual` (CLI) / comparação em tempo constante (Worker). |
| `MCP_REQUIRE_AUTH` | *(não definido)* | Worker | Quando `"true"`, força erro `401` em rotas protegidas caso nenhuma chave tenha sido configurada. |
| `MCP_ALLOWED_HOSTS` | *(loopback)* | CLI HTTP | Lista separada por vírgula de cabeçalhos `Host` aceitos (proteção anti-DNS rebinding). |
| `MCP_CORS_ALLOWED_ORIGINS` | *(loopback)* | CLI HTTP | Origens CORS permitidas no CLI HTTP (prioridade sobre `CORS_ALLOWED_ORIGINS`). |
| `CORS_ALLOWED_ORIGINS` | *(loopback CLI / `*` Worker)* | CLI HTTP / Worker | Origens CORS separadas por vírgula. No Cloudflare Worker é a variável lida por `lib/adapters/cloudflare.ts`. |
| `MCP_RATE_LIMIT` | `100` | CLI HTTP / Worker | Máximo de requisições por IP em janela de 60s (`cli-http.ts` e fallback em memória usam janela deslizante; Worker com KV usa janela fixa por minuto). Observação: o limitador interno por sessão em `createMCPServer()` aplica teto fixo de `100` req/min. |

### Timeouts, Cache e Proteção de Contexto (`lib/config/timeouts.ts`, `lib/shared/agentic-guard.ts`)

| Variável | Padrão | Escopo | Descrição |
|---|---|---|---|
| `MCP_ORDS_TIMEOUT` | `15000` ms | CLI Node (`process.env`) | Timeout por tentativa nas consultas ORDS (`siconfi_*` e `tesouro_operacoes_credito_ckan` no modo `operacoes_credito_pvl`). Não é declarado em `WorkerEnv` nem lido via `env` no Worker. |
| `MCP_HTTP_TIMEOUT` | `8000` ms | CLI Node (`process.env`) | Timeout por tentativa nas chamadas `httpJson` de Transferegov e Tesouro CKAN (`TIMEOUTS.HTTP_REQUEST_MS`). Não é declarado em `WorkerEnv` nem lido via `env` no Worker. |
| `MCP_API_TIMEOUT` | `8000` ms | `loadServerConfiguration()` | Popula apenas `serverConfig.apiTimeout` na carga de configuração Node; para alterar o timeout efetivo das chamadas HTTP no cliente, configure `MCP_HTTP_TIMEOUT` e `MCP_ORDS_TIMEOUT`. |
| `MCP_CACHE_SIZE` | `256` | CLI Node / Worker (fallback memória) | Quantidade máxima de entradas em cache LRU (`workerMemoryCache` no Worker quando `MCP_CACHE`/`MCP_KV` não está vinculado). |
| `MCP_CACHE_TTL` | `3600000` ms (`60000` no `wrangler.toml`) | Node / Worker | Tempo de vida de respostas válidas em ms (`KVCache` aplica piso mínimo de `60s`). Falhas e listas vazias nunca vão para cache. |
| `MCP_MAX_TOOL_OUTPUT_CHARS` | `100000` | Node / Worker | Limite de caracteres na serialização JSON de cada resposta (`serializeBoundedToolOutput`, mínimo `1024`). |

### Endpoints Customizados, Logs, OAuth e Privacidade

| Variável | Padrão | Escopo | Descrição |
|---|---|---|---|
| `TESOURO_ORDS_BASE_URL` | `https://apidatalake.tesouro.gov.br/ords/` | Node / Worker | Override validado na allowlist de SICONFI/SADIPEM. |
| `TRANSFEREGOV_BASE_URL` | `https://api.transferegov.gestao.gov.br/` | Node / Worker | Override validado na allowlist do Transferegov. |
| `TESOURO_CKAN_BASE_URL` | `https://www.tesourotransparente.gov.br/ckan/api/3/action/` | Node / Worker | Override validado na allowlist do Tesouro Transparente CKAN. |
| `MCPRC_PATH` | *(nenhum)* | CLI Node | Caminho explícito de arquivo `.mcprc.json` (tem precedência sobre `./.mcprc.json` e `~/.mcprc.json`). |
| `API_KEY_HEADER` / `API_KEY_VALUE` | *(nenhum)* | CLI Node | Cabeçalho de autenticação enviado pelo cliente MCP a um proxy upstream customizado. |
| `NODE_ENV` / `MCP_ALLOW_LOCALHOST_APIS` | *(não definidos)* | Node / Worker | Em `NODE_ENV=development\|test` (Node) ou `MCP_ALLOW_LOCALHOST_APIS="true"` (Worker), libera `http://localhost` / `127.0.0.1` / `::1` em `validateUrl()`. |
| `LOG_LEVEL` | `info` | CLI Node | Controla logs estruturados em `stderr`: `debug`, `info`, `warn`, `error` ou `silent`. Nunca polui `stdout`. |
| `MCP_DPO_CONTACT` | *(nenhum)* | Worker | Exposto em `GET /health` (`privacy.dpo_contact`) para atendimento LGPD Art. 41. |
| `OAUTH_ISSUER` / `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` / `OAUTH_REDIRECT_URIS` | *(não definidos)* | Worker | Habilitam descoberta RFC 8414/9728 (`/.well-known/*`). Sem IdP externo configurado, `/oauth/authorize` e `/oauth/token` retornam `501` fail-closed. |

---

## Arquivo `.mcprc.json` e Allowlists SSRF

Copie [`.mcprc.example.json`](../.mcprc.example.json) para `.mcprc.json` no diretório de execução (ou aponte via `MCPRC_PATH`):

```json
{
  "apiUrls": {
    "tesouroOrds": "https://apidatalake.tesouro.gov.br/ords/",
    "transferegov": "https://api.transferegov.gestao.gov.br/",
    "tesouroCkan": "https://www.tesourotransparente.gov.br/ckan/api/3/action/"
  },
  "auth": {
    "headers": {
      "X-API-Key": "chave-opcional-para-proxy-autorizado"
    }
  }
}
```

Por proteção contra **SSRF** ([`lib/shared/utils/constants.ts`](../lib/shared/utils/constants.ts)), toda URL customizada passa por `validateUrl()`:

- **Protocolo HTTPS obrigatório** em produção e bloqueio de credenciais embutidas (`https://user:pass@...`).
- **Bloqueio de IPs privados e metadata endpoints** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `metadata.google.internal`, `.internal`, `.local`).
- **Allowlists estritas por domínio:**
  - ORDS: `apidatalake.tesouro.gov.br`
  - Transferegov: `api.transferegov.gestao.gov.br`
  - CKAN: `www.tesourotransparente.gov.br`, `tesourotransparente.gov.br`
- **Redirects desativados:** `httpJson` usa `redirect: "error"` para impedir desvio de allowlist por HTTP 301/302.

---

## Modos de Transporte (Node.js)

### `stdio` (Padrão)
Ideal para hosts desktop locais. Apenas quadros JSON-RPC 2.0 trafegam em `stdout`; logs estruturados e métricas `[metrics]` no encerramento saem em `stderr`.

```bash
node build/lib/bin/mcp-orcamento.js
```

### `http` (Streamable HTTP + SSE Legado)
Exposição de rede local ou container Docker com Express 5:

```bash
# Loopback local
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 node build/lib/bin/mcp-orcamento.js

# Exposição externa (MCP_API_KEY obrigatória)
MCP_TRANSPORT=http \
MCP_HTTP_HOST=0.0.0.0 \
MCP_HTTP_PORT=3000 \
MCP_API_KEY="seu-segredo-forte" \
MCP_ALLOWED_HOSTS="orcamento.suaempresa.com.br" \
MCP_CORS_ALLOWED_ORIGINS="https://app.suaempresa.com.br" \
node build/lib/bin/mcp-orcamento.js
```

Rotas disponíveis: `ALL /mcp`, `GET /sse`, `POST /messages?sessionId=<id>` e `GET /health`.

---

## Cloudflare Workers

O arquivo [`wrangler.toml`](../wrangler.toml) define os ambientes `default`, `staging` e `production`. Antes de publicar com `wrangler deploy`, substitua os IDs placeholder dos bindings KV `MCP_CACHE` e `MCP_KV`:

```bash
wrangler kv namespace create MCP_CACHE
wrangler kv namespace create MCP_KV

# Configure segredos na borda
wrangler secret put MCP_API_KEY
wrangler secret put MCP_REQUIRE_AUTH   # informe "true" para bloquear chamadas sem chave

npm run build:worker
npm run deploy:staging
```

Endpoints expostos pelo Worker ([`lib/adapters/cloudflare.ts`](../lib/adapters/cloudflare.ts)):
- `GET /health` e `GET /openapi.json` (públicos)
- `POST /mcp`, `GET|POST /sse`, `POST /tools/{toolName}` (protegidos quando `MCP_API_KEY` ou `MCP_REQUIRE_AUTH="true"`)
- `GET /.well-known/oauth-authorization-server` e `GET /.well-known/oauth-protected-resource`

---

## Diagnóstico Rápido

1. **Erro `Host '...' is not in allowlist` ou `Upstream API URL must use HTTPS protocol`:** verifique se uma variável `*_BASE_URL` ou `.mcprc.json` aponta fora das allowlists oficiais ou usa `http://` sem `NODE_ENV=development`/`MCP_ALLOW_LOCALHOST_APIS=true`.
2. **Servidor HTTP recusa iniciar fora de `127.0.0.1`:** comportamento esperado (`fail-closed`). Defina `MCP_API_KEY` ao usar `MCP_HTTP_HOST=0.0.0.0`.
3. **Timeout em `siconfi_rreo` ou `siconfi_dca` de grandes entes:** aumente `MCP_ORDS_TIMEOUT` (ex.: `25000`) e utilize `no_anexo` / `filtro_conta` para reduzir o payload.
