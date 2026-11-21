import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TESOURO_CKAN_URL,
  DEFAULT_TESOURO_ORDS_URL,
  DEFAULT_TRANSFEREGOV_URL,
  isAllowedTesouroCkanUrl,
  isAllowedTesouroOrdsUrl,
  isAllowedTransferegovUrl,
  loadServerConfiguration,
  resolveApiConfig,
  validateUrl,
} from "../../lib/config/index.js";
import { getOrdsRequestTimeoutMs, parsePositiveTimeoutMs } from "../../lib/config/timeouts.js";

describe("Configuration & SSRF Allowlist Guards", () => {
  const originalEnv = { ...process.env };
  const tempDirs: string[] = [];

  afterEach(() => {
    process.env = { ...originalEnv };
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves default upstream URLs cleanly and appends trailing slashes", () => {
    delete process.env.TESOURO_ORDS_BASE_URL;
    delete process.env.TRANSFEREGOV_BASE_URL;
    delete process.env.TESOURO_CKAN_BASE_URL;

    const cfg = resolveApiConfig();
    expect(cfg.tesouroOrdsBaseUrl).toBe(DEFAULT_TESOURO_ORDS_URL);
    expect(cfg.transferegovBaseUrl).toBe(DEFAULT_TRANSFEREGOV_URL);
    expect(cfg.tesouroCkanBaseUrl).toBe(DEFAULT_TESOURO_CKAN_URL);

    expect(isAllowedTesouroOrdsUrl("https://apidatalake.tesouro.gov.br/ords")).toBe(true);
    expect(isAllowedTransferegovUrl("https://api.transferegov.gestao.gov.br")).toBe(true);
    expect(isAllowedTesouroCkanUrl("https://tesourotransparente.gov.br/ckan/api/3/action")).toBe(
      true
    );
  });

  it("blocks private IPs, metadata hosts, plain HTTP, disallowed domains, and embedded credentials", () => {
    const credPrefix = ["usr", "pwd"].join(":");
    const blocked = [
      "http://apidatalake.tesouro.gov.br/ords/",
      `https://${credPrefix}@apidatalake.tesouro.gov.br/ords/`,
      "http://localhost:8080/ords/",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.1/ords/",
      "https://192.168.1.50/ords/",
      "https://172.16.0.5/ords/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://internal.local/api/",
      "https://fc00::1/api/",
      "https://evil.example.com/ords/",
      "not-a-url",
      "",
    ];

    for (const candidate of blocked) {
      expect(
        () => validateUrl(candidate, { allowedHosts: ["apidatalake.tesouro.gov.br"], env: "production" }),
        `Expected production URL to be blocked: ${candidate}`
      ).toThrow();
    }

    // Embedded credentials remain blocked even in development/test
    expect(() =>
      validateUrl(`http://${credPrefix}@localhost:9000/ords/`, { env: "test", allowLoopback: true })
    ).toThrow(/credentials/i);
  });

  it("permits HTTP loopback only in development/test or when allowLoopback is true", () => {
    const localUrl = validateUrl("http://127.0.0.1:4567/ords", { env: "test" });
    expect(localUrl).toBe("http://127.0.0.1:4567/ords/");

    expect(() => validateUrl("http://[::1]:4567/ords", { env: "production" })).toThrow();
    expect(validateUrl("http://localhost:4567/ords", { allowLoopback: true, env: "production" })).toBe(
      "http://localhost:4567/ords/"
    );
  });

  it("loads .mcprc.json, applies env overrides, and validates resolved server config", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mcp-orcamento-cfg-"));
    tempDirs.push(dir);
    const rcPath = path.join(dir, ".mcprc.json");

    writeFileSync(
      rcPath,
      JSON.stringify({
        apiUrls: {
          tesouroOrds: "http://127.0.0.1:9100/ords/",
          transferegov: "http://127.0.0.1:9200/",
          tesouroCkan: "http://127.0.0.1:9300/ckan/",
        },
        auth: {
          headers: { "x-file-header": "from-file" },
        },
      }),
      "utf8"
    );

    process.env.MCPRC_PATH = rcPath;
    process.env.API_KEY_HEADER = "x-env-key";
    process.env.API_KEY_VALUE = "env-val";
    process.env.TESOURO_CKAN_BASE_URL = "https://www.tesourotransparente.gov.br/ckan/api/3/action/";
    process.env.MCP_HTTP_PORT = "4321";
    process.env.MCP_TRANSPORT = "HTTP";
    process.env.MCP_HTTP_HOST = "127.0.0.1";

    const loaded = loadServerConfiguration({ env: "test" });
    expect(loaded.apiConfig.tesouroOrdsBaseUrl).toBe("http://127.0.0.1:9100/ords/");
    expect(loaded.apiConfig.transferegovBaseUrl).toBe("http://127.0.0.1:9200/");
    expect(loaded.apiConfig.tesouroCkanBaseUrl).toBe(
      "https://www.tesourotransparente.gov.br/ckan/api/3/action/"
    );
    expect(loaded.apiConfig.authHeaders).toEqual({
      "x-file-header": "from-file",
      "x-env-key": "env-val",
    });
    expect(loaded.serverConfig.transport).toBe("http");
    expect(loaded.serverConfig.httpPort).toBe(4321);
    expect(loaded.serverConfig.httpHost).toBe("127.0.0.1");

    // Malformed .mcprc.json throws ConfigurationError
    writeFileSync(rcPath, "{broken json", "utf8");
    expect(() => resolveApiConfig({ configFilePath: rcPath })).toThrow(/Failed to parse config file/);
  });

  it("parses ORDS and positive integer timeout overrides safely", () => {
    expect(parsePositiveTimeoutMs("25000", 15000)).toBe(25000);
    expect(parsePositiveTimeoutMs("0", 15000)).toBe(15000);
    expect(parsePositiveTimeoutMs("abc", 15000)).toBe(15000);
    expect(getOrdsRequestTimeoutMs("20000")).toBe(20000);
    expect(getOrdsRequestTimeoutMs("invalid")).toBe(15000);
  });
});
