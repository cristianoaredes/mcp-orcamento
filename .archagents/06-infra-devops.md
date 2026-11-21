# CI, ambientes e publicação

Base atual: `TCK-0001` (`v0.1.0`, implementado).

- **CI (`.github/workflows/ci.yml`):** matriz Node.js `22.x`, `24.x`, `26.x`, build Node (`tsc`) e Worker (`tsc -p tsconfig.worker.json`), cobertura Vitest (`85/85/80/85`), smoke de transportes `stdio` e `HTTP/SSE`, `npm audit --omit=dev --audit-level=high` e limite de linhas em `lib/core/mcp-server.ts` (`<= 180`).
- **Cloudflare Workers (`wrangler.toml`):** ambientes `production` (`mcp-orcamento-aredes-prod`) e `staging` (`mcp-orcamento-aredes-staging`) com IDs KV placeholder para preenchimento antes de deploy.

## Fontes

- `.github/workflows/ci.yml`
- `wrangler.toml`
- `package.json`
