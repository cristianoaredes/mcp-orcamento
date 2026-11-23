# Documentação — MCP Orçamento `by Orqo`

> **Documentação técnica completa para consultas de orçamento público brasileiro (SICONFI, Transferegov, SADIPEM e Tesouro CKAN) via Model Context Protocol (MCP).**

## Idiomas e Índices Disponíveis

### Português Brasileiro (`PT-BR`)
- **[Guia Rápido PT-BR](pt-br/README.md)** — Início rápido, compilação do código-fonte e fluxos típicos no Brasil.
- **[Configuração e Segurança (`CONFIGURATION.md`)](CONFIGURATION.md)** — Variáveis de ambiente, `.mcprc.json`, allowlists SSRF, timeouts (`MCP_ORDS_TIMEOUT` / `MCP_HTTP_TIMEOUT`), auth HTTP fail-closed e deploy em Cloudflare Workers.
- **[Integração em Clientes MCP (`MCP_CLIENT_INTEGRATION.md`)](MCP_CLIENT_INTEGRATION.md)** — Configuração passo a passo para Claude Desktop, Claude Code, Cursor, Windsurf, VS Code / Cline, Continue.dev e clientes HTTP/REST remotos.
- **[Exemplos de Uso (`USAGE_EXAMPLES.md`)](USAGE_EXAMPLES.md)** — Exemplos práticos para todas as 8 ferramentas com chamadas JSON-RPC, prompts e saídas reais obtidas contra as APIs oficiais, além de cruzamentos com `@aredes.me/mcp-dadosbr` e `@aredes.me/mcp-tse`.

### Raiz e Governança
- **[README principal](../README.md)** — Visão geral, o problema resolvido, perímetro de execução e FAQ.
- **[CHANGELOG](../CHANGELOG.md)** — Histórico de versões e entregas (`0.1.0`).
- **[llms.txt](../llms.txt)** — Resumo estruturado no padrão `llmstxt.org` para indexadores e agentes de IA.
- **[PRIVACY](../PRIVACY.md)** · **[CONTRIBUTING](../CONTRIBUTING.md)** · **[Governança `.archagents/`](../.archagents/README.md)**

## Início Rápido

> **Distribuição (`2026-11-23`):** O pacote [`@aredes.me/mcp-orcamento`](https://www.npmjs.com/package/@aredes.me/mcp-orcamento) (`0.1.0`) está publicado no registro **npm**. Execute diretamente com `npx -y @aredes.me/mcp-orcamento` ou compile localmente a partir do código-fonte:

```bash
# Execução direta via npm
npx -y @aredes.me/mcp-orcamento

# Ou build a partir do código-fonte
git clone https://github.com/cristianoaredes/mcp-orcamento.git
cd mcp-orcamento
npm ci
npm run build && npm run build:worker

# Primeira consulta stdio (SICONFI - entes federativos)
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"siconfi_entes","arguments":{"uf":"MG","capital_only":true}}}' \
  | npx -y @aredes.me/mcp-orcamento
```

## Catálogo Resumido das 8 Ferramentas (`v0.1.0`)

| Ferramenta | Domínio | Chave / Filtro Obrigatório | Fonte Oficial |
|---|---|---|---|
| `siconfi_entes` | Entes federativos (IBGE, CNPJ, população) | Pelo menos 1 de `cod_ibge`, `cnpj`, `uf`, `nome`, `esfera`, `capital_only: true` | STN SICONFI ORDS |
| `siconfi_extrato_entregas` | Histórico de entrega (RREO, RGF, DCA, MSC) | `id_ente`, `an_referencia` (`2015..2030`) | STN SICONFI ORDS |
| `siconfi_rreo` | Relatório Resumido da Execução Orçamentária | `id_ente`, `an_exercicio`, `nr_periodo` (`1..6`) | STN SICONFI ORDS |
| `siconfi_rgf` | Relatório de Gestão Fiscal (LRF / Pessoal / DCL) | `id_ente`, `an_exercicio`, `nr_periodo` (`1..3` Q \| `1..2` S) | STN SICONFI ORDS |
| `siconfi_dca` | Declaração de Contas Anuais (Balanço) | `id_ente`, `an_exercicio` (`2015..2030`) | STN SICONFI ORDS |
| `transferegov_emendas_especiais` | Transferências Especiais / Emendas Pix | Todos opcionais (ex.: `recurso`, `uf`, `ano`, `cnpj_beneficiario`, `nome_parlamentar`) | MGI Transferegov PostgREST |
| `transferegov_fundo_a_fundo_ted` | Fundo a Fundo e TED | `modalidade` (`fundoafundo` \| `ted`), par estrito com `recurso` | MGI Transferegov PostgREST |
| `tesouro_operacoes_credito_ckan` | Pleitos PVL e datasets CKAN | `modo` (`operacoes_credito_pvl` exige `uf` \| `ckan_datasets`) | STN SADIPEM / Tesouro CKAN |

## Suporte e Contribuição

- **Issues:** [github.com/cristianoaredes/mcp-orcamento/issues](https://github.com/cristianoaredes/mcp-orcamento/issues)
- **Licença:** `AGPL-3.0-only` ([`LICENSE`](../LICENSE) · [`NOTICE.md`](../NOTICE.md))
