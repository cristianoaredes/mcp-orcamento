import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleHealthCheck } from "../../lib/adapters/cloudflare.js";
import { TOOL_DEFINITIONS } from "../../lib/core/tools.js";
import { TOOL_NAMES } from "../../lib/core/tool-schemas.js";
import { SERVER } from "../../lib/shared/utils/constants.js";
import { buildOpenApiSpec } from "../../lib/workers/openapi.js";
import { handleWorkerFetch } from "../../lib/workers/worker.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("Architecture Hygiene", () => {
  it("keeps shared, tools, core, workers, and cloudflare adapter free of node:* imports", () => {
    const targets = [
      ...collectTsFiles(path.join(REPO_ROOT, "lib/shared")),
      ...collectTsFiles(path.join(REPO_ROOT, "lib/tools")),
      ...collectTsFiles(path.join(REPO_ROOT, "lib/core")),
      ...collectTsFiles(path.join(REPO_ROOT, "lib/workers")),
      path.join(REPO_ROOT, "lib/adapters/cloudflare.ts"),
    ];

    const nodeBuiltinPattern = /from\s+["'](?:node:[^"']+|fs|path|os|http|https|crypto|stream|net)["']/g;
    for (const filePath of targets) {
      const content = readFileSync(filePath, "utf8");
      const matches = content.match(nodeBuiltinPattern) ?? [];
      expect(matches, `Unexpected Node import in ${filePath}`).toEqual([]);
    }
  });

  it("enforces acyclic core -> tools layering (only lib/core/tools.ts imports lib/tools/)", () => {
    const coreFiles = collectTsFiles(path.join(REPO_ROOT, "lib/core"));
    for (const filePath of coreFiles) {
      const content = readFileSync(filePath, "utf8");
      if (path.basename(filePath) === "tools.ts") {
        expect(content).toContain("../tools/index.js");
      } else {
        expect(content).not.toMatch(/from\s+["']\.\.\/tools/);
      }
    }
  });

  it("keeps lib/core/mcp-server.ts concise (<= 180 lines) and free of node:fs", () => {
    const mcpServerPath = path.join(REPO_ROOT, "lib/core/mcp-server.ts");
    const content = readFileSync(mcpServerPath, "utf8");
    const lineCount = content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    expect(lineCount).toBeLessThanOrEqual(180);
    expect(content).not.toContain("node:fs");
  });

  it("keeps version and 8-tool catalog aligned across package.json, SERVER, OpenAPI, /health, and /", async () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };

    expect(pkg.name).toBe("@aredes.me/mcp-orcamento");
    expect(pkg.version).toBe("0.1.0");
    expect(SERVER.NAME).toBe("mcp-orcamento");
    expect(SERVER.VERSION).toBe(pkg.version);
    expect(TOOL_DEFINITIONS).toHaveLength(8);
    expect(TOOL_NAMES).toHaveLength(8);

    const openApi = buildOpenApiSpec();
    expect(openApi.info.version).toBe(pkg.version);
    const enumTools = openApi.paths["/tools/{toolName}"].post.parameters[0].schema.enum;
    expect(enumTools).toEqual([...TOOL_NAMES]);

    const healthResp = await handleHealthCheck({});
    const healthJson = (await healthResp.json()) as {
      service: string;
      version: string;
      tools: number;
    };
    expect(healthJson.service).toBe("mcp-orcamento");
    expect(healthJson.version).toBe(pkg.version);
    expect(healthJson.tools).toBe(8);

    const rootResp = await handleWorkerFetch(new Request("https://example.test/"), {});
    const rootJson = (await rootResp.json()) as {
      service: string;
      version: string;
      tool_count: number;
      tools: string[];
    };
    expect(rootJson.service).toBe("mcp-orcamento");
    expect(rootJson.version).toBe(pkg.version);
    expect(rootJson.tool_count).toBe(8);
    expect(rootJson.tools).toEqual(TOOL_DEFINITIONS.map((t) => t.name));
  });
});
