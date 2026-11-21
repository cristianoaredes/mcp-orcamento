import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSSESession,
  getSSESession,
  handleSSEEndpoint,
  resetSSESessions,
} from "../../lib/workers/sse.js";
import { handleWorkerFetch } from "../../lib/workers/worker.js";
import type { WorkerEnv } from "../../lib/workers/types.js";

describe("Worker SSE & KV Session Handling", () => {
  beforeEach(() => {
    resetSSESessions();
  });

  afterEach(() => {
    resetSSESessions();
  });

  it("streams initial endpoint & connected events on GET /sse and persists session in KV", async () => {
    const store = new Map<string, { value: string; expirationTtl?: number }>();
    const env: WorkerEnv = {
      MCP_KV: {
        get: vi.fn(async (k: string) => {
          const hit = store.get(k);
          return hit ? JSON.parse(hit.value) : null;
        }),
        put: vi.fn(async (k: string, v: string, opts?: { expirationTtl?: number }) => {
          store.set(k, { value: v, expirationTtl: opts?.expirationTtl });
        }),
      },
    };

    const resp = await handleWorkerFetch(new Request("https://worker.test/sse"), env);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("text/event-stream");

    const text = await resp.text();
    expect(text).toContain("event: endpoint");
    expect(text).toContain("event: connected");
    expect(text).toContain('"server":"mcp-orcamento"');
    expect(text).toContain('"version":"0.1.0"');
    const sessionEntries = Array.from(store.entries()).filter(([k]) =>
      k.startsWith("sse:session:")
    );
    expect(sessionEntries).toHaveLength(1);

    const [savedKey, savedMeta] = sessionEntries[0];
    expect(savedMeta.expirationTtl).toBe(300);

    const sessionId = savedKey.replace("sse:session:", "");
    const loaded = await getSSESession(sessionId, env);
    expect(loaded?.sessionId).toBe(sessionId);
  });

  it("handles POST /sse JSON-RPC messages, updates session activity, and validates errors", async () => {
    const session = await createSSESession({}, "sess-123");
    expect(session.sessionId).toBe("sess-123");

    const postResp = await handleSSEEndpoint(
      new Request("https://worker.test/sse?sessionId=sess-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
      }),
      {}
    );
    expect(postResp.status).toBe(200);
    const json = (await postResp.json()) as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(8);

    const invalidBody = await handleSSEEndpoint(
      new Request("https://worker.test/sse", { method: "POST", body: "{not-json" }),
      {}
    );
    expect(invalidBody.status).toBe(400);

    const methodNotAllowed = await handleSSEEndpoint(
      new Request("https://worker.test/sse", { method: "DELETE" }),
      {}
    );
    expect(methodNotAllowed.status).toBe(405);
  });
});
