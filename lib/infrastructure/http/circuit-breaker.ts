/**
 * Per-origin Circuit Breaker for upstream public APIs.
 * Transitions: CLOSED -> OPEN (after failureThreshold failures) -> HALF_OPEN (after resetTimeoutMs) -> CLOSED.
 */

import { TIMEOUTS } from "../../config/timeouts.js";
import { CIRCUIT_BREAKER } from "../../shared/utils/constants.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  service?: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

export class CircuitBreakerOpenError extends Error {
  readonly service: string;
  readonly nextAttemptAt: number;

  constructor(service: string, nextAttemptAt: number) {
    super(`Circuit breaker is OPEN for '${service}' until ${new Date(nextAttemptAt).toISOString()}`);
    this.name = "CircuitBreakerOpenError";
    this.service = service;
    this.nextAttemptAt = nextAttemptAt;
  }
}

export interface CircuitBreakerMetrics {
  service: string;
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  halfOpenAttempts: number;
  nextAttemptAt: number;
}

export class CircuitBreaker {
  private readonly service: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private halfOpenAttempts = 0;
  private halfOpenSuccesses = 0;
  private nextAttemptAt = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.service = options.service ?? "upstream";
    this.failureThreshold =
      options.failureThreshold && options.failureThreshold > 0
        ? options.failureThreshold
        : CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.resetTimeoutMs =
      options.resetTimeoutMs && options.resetTimeoutMs > 0
        ? options.resetTimeoutMs
        : TIMEOUTS.CIRCUIT_BREAKER_RESET_MS;
    this.halfOpenMaxAttempts =
      options.halfOpenMaxAttempts && options.halfOpenMaxAttempts > 0
        ? options.halfOpenMaxAttempts
        : CIRCUIT_BREAKER.HALF_OPEN_MAX_ATTEMPTS;
  }

  getState(now: number = Date.now()): CircuitState {
    if (this.state === "OPEN" && now >= this.nextAttemptAt) {
      this.state = "HALF_OPEN";
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
    }
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      service: this.service,
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      halfOpenAttempts: this.halfOpenAttempts,
      nextAttemptAt: this.nextAttemptAt,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === "OPEN") {
      throw new CircuitBreakerOpenError(this.service, this.nextAttemptAt);
    }

    if (current === "HALF_OPEN") {
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        throw new CircuitBreakerOpenError(this.service, this.nextAttemptAt);
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.consecutiveFailures = 0;

    if (this.state === "HALF_OPEN") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.halfOpenMaxAttempts) {
        this.state = "CLOSED";
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
      }
    } else {
      this.state = "CLOSED";
    }
  }

  private onFailure(): void {
    this.failures++;
    this.consecutiveFailures++;

    if (this.state === "HALF_OPEN" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
    }
  }

  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.halfOpenSuccesses = 0;
    this.nextAttemptAt = 0;
  }
}
