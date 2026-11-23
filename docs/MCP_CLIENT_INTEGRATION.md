# Guia de Integração em Clientes MCP — MCP Orçamento

_Como conectar o `@aredes.me/mcp-orcamento` ao Claude Desktop, Claude Code, Cursor, Windsurf, VS Code (Cline), Continue.dev, MCP Inspector e clientes HTTP/REST._

> **Importante — Status no npm (`2026-11-23`):** O pacote `@aredes.me/mcp-orcamento` está na versão `0.1.0` em código e **ainda não foi publicado no npm**. Enquanto não houver a primeira release no registro npm, compile localmente (`git clone ... && npm ci && npm run build`) e aponte os clientes para `build/lib/bin/mcp-orcamento.js`. Os exemplos com `npx -y @aredes.me/mcp-orcamento` passam a funcionar automaticamente após a publicação no npm.

## Índice

- [Pré-requisito de Compilação Local](#pré-requisito-de-compilação-local)
- [Claude Desktop](#claude-desktop)
- [Claude Code](#claude-code)
- [Cursor](#cursor)
- [Windsurf](#windsurf)
- [VS Code (Cline / MCP nativo)](#vs-code-cline--mcp-nativo)
- [Continue.dev](#continuedev)
- [MCP Inspector](#mcp-inspector)
- [Cliente HTTP / Streamable HTTP / Cloudflare Worker](#cliente-http--streamable-http--cloudflare-worker)
- [Ecossistema Integrado (`orcamento` + `dadosbr` + `tse`)](#ecossistema-integrado-orcamento--dadosbr--tse)
- [Troubleshooting](#troubleshooting)

---

## Pré-requisito de Compilação Local

Requer **Node.js `>= 22.12`, `24` ou `26`**:

```bash
git clone https://github.com/cristianoaredes/mcp-orcamento.git
cd mcp-orcamento
npm ci
npm run build && npm run build:worker
```

Anote o caminho absoluto resultante, por exemplo:
`/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js`

---

## Claude Desktop

Edite o arquivo de configuração do Claude Desktop:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

### Usando build local (recomendado até publicação no npm)

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"],
      "env": {
        "MCP_ORDS_TIMEOUT": "20000",
        "MCP_HTTP_TIMEOUT": "10000",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

### Após publicação no npm

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "npx",
      "args": ["-y", "@aredes.me/mcp-orcamento"]
    }
  }
}
```

Reinicie o Claude Desktop e confirme que as 8 ferramentas (`siconfi_*`, `transferegov_*`, `tesouro_operacoes_credito_ckan`) aparecem no menu de conectores.

---

## Claude Code

Registre via CLI `claude mcp add` usando o build local:

```bash
claude mcp add orcamento -- node /caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js
```

Ou adicione no `.mcp.json` do projeto:

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"]
    }
  }
}
```

---

## Cursor

Em **Settings > Cursor Settings > MCP > Add new global MCP server** (ou `.cursor/mcp.json` no projeto):

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"],
      "env": {
        "MCP_ORDS_TIMEOUT": "15000"
      }
    }
  }
}
```

---

## Windsurf

Em `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"]
    }
  }
}
```

---

## VS Code (Cline / MCP nativo)

### VS Code (`.vscode/mcp.json`)

```json
{
  "servers": {
    "orcamento": {
      "type": "stdio",
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"]
    }
  }
}
```

### Cline (extensão VS Code)
No arquivo `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"],
      "disabled": false
    }
  }
}
```

---

## Continue.dev

Em `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"]
        }
      }
    ]
  }
}
```

---

## MCP Inspector

Inspecione schemas, descrições e execute chamadas ao vivo no navegador:

```bash
npx @modelcontextprotocol/inspector node build/lib/bin/mcp-orcamento.js
```

---

## Cliente HTTP / Streamable HTTP / Cloudflare Worker

Suba o servidor HTTP local:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 node build/lib/bin/mcp-orcamento.js
```

Verifique saúde e liste ferramentas via Streamable HTTP (`POST /mcp`) ou REST no Cloudflare Worker (`POST /tools/{toolName}`):

```bash
# Health check
curl -s http://127.0.0.1:3000/health | jq .

# Streamable HTTP (CLI Node ou Worker)
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "siconfi_entes",
      "arguments": { "cod_ibge": "3106200", "limit": 1 }
    }
  }'

# REST genérico disponível no Cloudflare Worker (adicione Authorization: Bearer <MCP_API_KEY> se protegido)
curl -s -X POST https://seu-worker.workers.dev/tools/tesouro_operacoes_credito_ckan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{ "modo": "operacoes_credito_pvl", "uf": "PR", "limit": 2 }'
```

---

## Ecossistema Integrado (`orcamento` + `dadosbr` + `tse`)

Combine múltiplos servidores da família `@aredes.me/*` no mesmo host (`claude_desktop_config.json`, `.cursor/mcp.json` ou `.mcp.json`):

```json
{
  "mcpServers": {
    "orcamento": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-orcamento/build/lib/bin/mcp-orcamento.js"]
    },
    "dadosbr": {
      "command": "npx",
      "args": ["-y", "@aredes.me/mcp-dadosbr"]
    },
    "tse": {
      "command": "node",
      "args": ["/caminho/absoluto/mcp-tse/build/lib/bin/mcp-tse.js"]
    }
  }
}
```

> Nota: `@aredes.me/mcp-dadosbr` possui versão `0.6.0` publicada no npm (`0.7.0` em `main`); `@aredes.me/mcp-orcamento` e `@aredes.me/mcp-tse` ainda exigem build local até a publicação inicial no registro npm.

---

## Troubleshooting

- **Cliente reporta falha de JSON-RPC na inicialização `stdio`:** confirme que está apontando para `build/lib/bin/mcp-orcamento.js` após `npm run build` e usando Node.js `22.12+`, `24` ou `26`.
- **Erro HTTP `403 Host header not allowed` em conexão HTTP:** ao acessar por hostname diferente de `localhost`/`127.0.0.1`, informe `MCP_ALLOWED_HOSTS=seu-host.local`.
- **Erro `401 Unauthorized` no Worker/HTTP:** envie `Authorization: Bearer <MCP_API_KEY>` ou `X-API-Key: <MCP_API_KEY>`.
