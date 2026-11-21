import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCircuitBreakerForOrigin,
  getCircuitBreakerMetrics,
  httpJson,
  resetCircuitBreakers,
} from "../../lib/core/http-client.js";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../../lib/infrastructure/http/circuit-breaker.js";
import {
  createTimeoutController,
  isAbortOrTimeoutError,
  raceWithTimeoutAndSignal,
} from "../../lib/shared/utils/timeout.js";

describe("HTTP Client & Circuit Breaker", () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCircuitBreakers();
  });

  it("opens CircuitBreaker on threshold failures and closes after HALF_OPEN recovery", async () => {
    const breaker = new CircuitBreaker({
      service: "https://api.test",
      failureThreshold: 2,
      resetTimeoutMs: 25,
      halfOpenMaxAttempts: 2,
    });

    expect(breaker.getState()).toBe("CLOSED");

    await expect(
      breaker.execute(async () => {
        throw new Error("boom-1");
      })
    ).rejects.toThrow("boom-1");

    await expect(
      breaker.execute(async () => {
        throw new Error("boom-2");
      })
    ).rejects.toThrow("boom-2");

    expect(breaker.getState()).toBe("OPEN");
    await expect(breaker.execute(async () => "blocked")).rejects.toBeInstanceOf(
      CircuitBreakerOpenError
    );

    await new Promise((r) => setTimeout(r, 35));
    expect(breaker.getState()).toBe("HALF_OPEN");

    expect(await breaker.execute(async () => "ok-1")).toBe("ok-1");
    expect(await breaker.execute(async () => "ok-2")).toBe("ok-2");
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getMetrics().successes).toBe(2);
  });

  it("retries transient 5xx responses, ignores 404 for circuit breaking, and parses malformed JSON safely", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 503, statusText: "Unavailable" }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const recovered = await httpJson("https://apidatalake.tesouro.gov.br/ords/test", {
      retries: 1,
      baseDelayMs: 0,
      requestId: "req-1",
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 404 is non-retryable and does not open the circuit breaker
    const fetch404 = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetch404);
    const breaker = getCircuitBreakerForOrigin("https://apidatalake.tesouro.gov.br");
    const r404 = await httpJson("https://apidatalake.tesouro.gov.br/ords/missing", {
      retries: 2,
      baseDelayMs: 0,
      circuitBreaker: breaker,
    });
    expect(r404.ok).toBe(false);
    expect(r404.error).toContain("HTTP 404");
    expect(fetch404).toHaveBeenCalledTimes(1);
    expect(breaker.getState()).toBe("CLOSED");
    expect(getCircuitBreakerMetrics().length).toBeGreaterThanOrEqual(1);

    // Invalid JSON from 200 response returns structured error
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json{", { status: 200 })));
    const badJson = await httpJson("https://apidatalake.tesouro.gov.br/ords/badjson", {
      retries: 0,
    });
    expect(badJson.ok).toBe(false);
    expect(badJson.error).toContain("Invalid JSON");
  });

  it("handles pre-aborted signals and timeout utilities cleanly", async () => {
    const parent = new AbortController();
    parent.abort();

    const aborted = await httpJson("https://apidatalake.tesouro.gov.br/ords/test", {
      signal: parent.signal,
    });
    expect(aborted.ok).toBe(false);
    expect(aborted.error).toContain("aborted");

    const linked = createTimeoutController(500);
    expect(linked.didTimeout()).toBe(false);
    expect(linked.wasAbortedByParent()).toBe(false);
    linked.cleanup();

    expect(isAbortOrTimeoutError({ name: "AbortError" })).toBe(true);
    expect(isAbortOrTimeoutError({ name: "TimeoutError" })).toBe(true);
    expect(isAbortOrTimeoutError(new Error("other"))).toBe(false);

    await expect(
      raceWithTimeoutAndSignal(new Promise((r) => setTimeout(r, 100)), 15, undefined, "SlowOp")
    ).rejects.toThrow(/timed out/);

    await expect(raceWithTimeoutAndSignal(Promise.resolve("fast"), 200)).resolves.toBe("fast");

    const preAborted = new AbortController();
    preAborted.abort();
    const ctrlAborted = createTimeoutController(100, preAborted.signal);
    expect(ctrlAborted.wasAbortedByParent()).toBe(true);
    await expect(
      raceWithTimeoutAndSignal(new Promise((r) => setTimeout(r, 50)), 100, preAborted.signal)
    ).rejects.toThrow(/aborted/);

    const midAbort = new AbortController();
    const ctrlMid = createTimeoutController(500, midAbort.signal);
    midAbort.abort();
    expect(ctrlMid.wasAbortedByParent()).toBe(true);
    ctrlMid.cleanup();

    // Open circuit breaker returns structured { ok: false } in httpJson
    const openBreaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await httpJson("https://apidatalake.tesouro.gov.br/ords/fail", {
      retries: 0,
      circuitBreaker: openBreaker,
    });
    const blocked = await httpJson("https://apidatalake.tesouro.gov.br/ords/fail", {
      retries: 0,
      circuitBreaker: openBreaker,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("OPEN");

    // Empty 200 response -> ok: true, data: null; invalid URL origin falls back cleanly
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const emptyBody = await httpJson("not-a-valid-url", { retries: 0 });
    expect(emptyBody.ok).toBe(true);
    expect(emptyBody.data).toBeNull();

    // Timeout during pending fetch triggers AbortController and retries cleanly
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      )
    );
    const timedOut = await httpJson("https://apidatalake.tesouro.gov.br/ords/slow", {
      timeout: 10,
      retries: 1,
      baseDelayMs: 1,
    });
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error).toContain("timed out");
  });
});
