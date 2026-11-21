# Visão geral

Base atual: `TCK-0001` (`v0.1.0`, molde `mcp-dadosbr`, implementado).

Servidor MCP em TypeScript (`@aredes.me/mcp-orcamento`, licença `AGPL-3.0-only`, atribuições em `NOTICE.md`) para consulta read-only e sem API key de dados públicos orçamentários e fiscais brasileiros (SICONFI/STN, Transferegov, SADIPEM/PVL e Tesouro Transparente CKAN). Expõe 8 ferramentas MCP com validação Zod em runtime (`stdio`, `HTTP/SSE` em Node.js e adapter Cloudflare Workers com endpoints REST `/tools/{toolName}`, `/mcp`, `/sse`, `/openapi.json` e `/health`).

## Fontes

- `package.json`
- `wrangler.toml`
- `.archagents/_capabilities.json`
- `.archagents/mcp-tool-allowlist.json`
