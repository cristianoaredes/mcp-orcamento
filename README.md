# MCP Orçamento (`@aredes.me/mcp-orcamento`)

Servidor [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) em TypeScript (`v0.1.0`, `AGPL-3.0-only`) para consultas **somente leitura** e **sem necessidade de API key** às principais APIs públicas brasileiras de orçamento, execução fiscal, transferências federais e operações de crédito:

- **SICONFI (Tesouro Nacional ORDS):** entes federativos, extrato de entregas, RREO, RGF e DCA
- **Transferegov (MGI PostgREST):** Transferências Especiais (*Emendas Pix* / art. 166-A), Fundo a Fundo e Termos de Execução Descentralizada (TED)
- **SADIPEM / PVL & Tesouro Transparente CKAN:** pedidos de verificação de limites e condições (operações de crédito subnacionais) e busca de datasets abertos

> Documentação canônica e rastreabilidade `codebase-ops`: [`.archagents/README.md`](.archagents/README.md) · Privacidade/LGPD: [`PRIVACY.md`](PRIVACY.md) · Licenciamento/Atribuições: [`NOTICE.md`](NOTICE.md)

## Catálogo de Ferramentas (8 tools)

| Ferramenta | Fonte | Descrição |
|---|---|---|
| `siconfi_entes` | STN SICONFI ORDS | Lista e filtra entes federativos (IBGE, CNPJ, UF, esfera `U/E/M/D`, capitais, nome) |
| `siconfi_extrato_entregas` | STN SICONFI ORDS | Histórico de entregas de demonstrativos (`RREO`, `RGF`, `DCA`, `MSC`) por ente e ano |
| `siconfi_rreo` | STN SICONFI ORDS | Relatório Resumido da Execução Orçamentária com `anexos_disponiveis` e paginação |
| `siconfi_rgf` | STN SICONFI ORDS | Relatório de Gestão Fiscal por periodicidade (`Q`/`S`), poder (`E/L/J/M/D`) e anexo |
| `siconfi_dca` | STN SICONFI ORDS | Declaração de Contas Anuais com descoberta de anexos e filtro local por conta |
| `transferegov_emendas_especiais` | Transferegov PostgREST | Planos de ação, executores, empenhos, ordens de pagamento/bancárias e relatórios |
| `transferegov_fundo_a_fundo_ted` | Transferegov PostgREST | Recursos de transferências Fundo a Fundo (`fundoafundo/*`) e TED (`ted/*`) |
| `tesouro_operacoes_credito_ckan` | STN SADIPEM & CKAN | Operações de crédito subnacionais (`operacoes_credito_pvl`) e datasets (`ckan_datasets`) |

## Uso Rápido

```bash
npm install
npm run build
npm run build:worker

# Transporte stdio (padrão para hosts MCP)
npm start

# Transporte HTTP + SSE local endurecido (127.0.0.1:3000)
node build/lib/bin/mcp-orcamento.js --http --port 3000
```

### Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` ou `http` |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | `127.0.0.1` / `3000` | Bind do servidor HTTP Node |
| `MCP_API_KEY` / `API_KEY` | *(opcional)* | Habilita autenticação `Bearer` / `X-API-Key` nas rotas HTTP/Worker protegidas |
| `MCP_ORDS_TIMEOUT` | `15000` | Timeout (ms) para chamadas ORDS (SICONFI / SADIPEM) |
| `MCP_HTTP_TIMEOUT` | `8000` | Timeout (ms) para chamadas HTTP padrão (Transferegov / CKAN) |
| `MCP_MAX_TOOL_OUTPUT_CHARS` | `100000` | Limite de tamanho do JSON retornado por tool |
| `TESOURO_ORDS_BASE_URL` | `https://apidatalake.tesouro.gov.br/ords/` | Override allowlisted da API Tesouro ORDS |
| `TRANSFEREGOV_BASE_URL` | `https://api.transferegov.gestao.gov.br/` | Override allowlisted da API Transferegov |
| `TESOURO_CKAN_BASE_URL` | `https://www.tesourotransparente.gov.br/ckan/api/3/action/` | Override allowlisted da API CKAN |
| `MCP_DPO_CONTACT` | *(opcional)* | Contato de DPO exposto em `GET /health` no Cloudflare Worker |

### Cloudflare Worker

O worker em [`lib/workers/worker.ts`](lib/workers/worker.ts) expõe:
- `GET /` — manifesto do serviço e lista das 8 ferramentas
- `GET /health` — status, métricas RED e informações de privacidade (`privacy.dpo_contact`)
- `GET /openapi.json` — especificação OpenAPI 3.0.3
- `POST /mcp` — endpoint JSON-RPC 2.0 MCP
- `GET|POST /sse` — transporte Server-Sent Events com persistência opcional em KV
- `POST /tools/{toolName}` — endpoint REST genérico validado pela allowlist de 8 ferramentas

## Segurança e Conformidade

- **Proteção SSRF (`lib/shared/utils/constants.ts`, `lib/config/index.ts`):** HTTPS obrigatório fora de `development`/`test`, bloqueio de IPs privados/metadados e credenciais embutidas na URL, e allowlists explícitas por domínio oficial.
- **Anti-injeção PostgREST (`lib/shared/orcamento-schemas.ts`, `lib/tools/transferegov.ts`):** remoção de operadores `[,()*%\\]` antes de construir expressões `ilike.*clean*`.
- **Controles Agênticos & LGPD (`lib/shared/agentic-guard.ts`, `lib/shared/compliance-notices.ts`):** validação Zod `.strict()`, sanitização de strings externas, `untrusted_data_notice`, truncamento seguro e `lgpd_notice` (`HOMONYM_HUMAN_REVIEW_NOTICE`) quando há nomes parlamentares/nominais.

## Desenvolvimento e Testes

```bash
npx tsc --noEmit
npx tsc -p tsconfig.worker.json --noEmit
npm run test:coverage
npm run test:transport
```
