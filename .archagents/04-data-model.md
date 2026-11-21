# Contratos de dados

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`, `SPC-0001`).

Todas as 8 ferramentas retornam JSON estruturado em `content[0].text` limitado por `serializeBoundedToolOutput` (`MCP_MAX_TOOL_OUTPUT_CHARS`, padrão `100000`) com metadados de proveniência (`source`, `fetchedAt`) e `untrusted_data_notice`. Erros retornam `isError: true` no protocolo MCP e código JSON-RPC estruturado (`ErrorCode`). `ListResources` retorna lista vazia e `ReadResource` rejeita URIs desconhecidas com `InvalidParams`.

## Fontes

- `.archagents/12-inception/specs/SPC-0001-catalogo-inicial-v010-orcamento.md`
