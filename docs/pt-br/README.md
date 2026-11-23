# MCP Orçamento `by Orqo` — Guia Rápido em Português

Bem-vindo à documentação em português brasileiro do **MCP Orçamento** (`@aredes.me/mcp-orcamento`), servidor open source (`AGPL-3.0-only`) mantido pela [Orqo](https://orqo.pro/) para consultar finanças públicas brasileiras em assistentes de IA.

## O que este servidor entrega

- **8 ferramentas somente leitura sem chave de API:** SICONFI (`siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf`, `siconfi_dca`), Transferegov (`transferegov_emendas_especiais`, `transferegov_fundo_a_fundo_ted`) e SADIPEM/CKAN (`tesouro_operacoes_credito_ckan`).
- **Mesma base para CLI local e borda serverless:** código compartilhado sem `node:*` entre Node.js (`stdio` / `HTTP+SSE`) e Cloudflare Workers (`POST /mcp`, `/sse`, REST e `/openapi.json`).
- **Proveniência e proteção:** cada retorno traz `source.url`, `fetchedAt`, `untrusted_data_notice` e aviso LGPD Art. 20 quando envolve pessoas ou parlamentares.

## Índice Rápido

1. **[Configuração (`CONFIGURATION.md`)](../CONFIGURATION.md)** — Variáveis de ambiente, `.mcprc.json`, timeouts diferenciados (`MCP_ORDS_TIMEOUT` / `MCP_HTTP_TIMEOUT`), allowlists SSRF e deploy Cloudflare.
2. **[Integração com Clientes (`MCP_CLIENT_INTEGRATION.md`)](../MCP_CLIENT_INTEGRATION.md)** — Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Continue e clientes HTTP/REST.
3. **[Exemplos de Uso (`USAGE_EXAMPLES.md`)](../USAGE_EXAMPLES.md)** — Casos reais com RREO, RGF, DCA, Emendas Pix, Fundo a Fundo, TED, PVL, CKAN e cruzamento com `mcp-dadosbr` e `mcp-tse`.
4. **[Índice geral (`docs/README.md`)](../README.md)** e **[README principal](../../README.md)**.

## Instalação via npm ou Compilação Local

> **Distribuição (`2026-11-23`):** [`@aredes.me/mcp-orcamento`](https://www.npmjs.com/package/@aredes.me/mcp-orcamento) (`0.1.0`) está publicado no **npm** (`npx -y @aredes.me/mcp-orcamento`). Para compilação local e testes a partir do código-fonte:

```bash
git clone https://github.com/cristianoaredes/mcp-orcamento.git
cd mcp-orcamento
npm ci
npm run build && npm run build:worker

# Verificação completa (Vitest + transportes stdio/HTTP + Worker)
npm test
npm run test:transport
npx tsc --noEmit && npx tsc -p tsconfig.worker.json --noEmit
```

Para executar o servidor HTTP localmente em loopback (`127.0.0.1:3000`):

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 node build/lib/bin/mcp-orcamento.js
curl http://127.0.0.1:3000/health
```

Para contribuir com exemplos, correções ou melhorias, consulte [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
