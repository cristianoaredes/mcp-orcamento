/**
 * Structured stderr logger safe for stdio MCP transport and Cloudflare Workers.
 * All log lines go exclusively to stderr (console.error) and redact sensitive patterns.
 */

import { maskSensitiveText } from "../shared/log-redaction.js";
import { LOGGING, SERVER } from "../shared/utils/constants.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function parseLogLevel(raw: unknown): LogLevel | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error" ||
    normalized === "silent"
  ) {
    return normalized;
  }
  return undefined;
}

function readEnvLogLevel(): LogLevel {
  if (typeof process === "undefined" || !process?.env) {
    return LOGGING.DEFAULT_LEVEL;
  }
  return parseLogLevel(process.env.LOG_LEVEL) ?? LOGGING.DEFAULT_LEVEL;
}

function sanitizeMeta(meta: unknown): unknown {
  if (meta === null || meta === undefined) return meta;
  if (typeof meta === "string") return maskSensitiveText(meta, 500);
  if (typeof meta === "number" || typeof meta === "boolean") return meta;
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: maskSensitiveText(meta.message, 500),
    };
  }
  if (Array.isArray(meta)) {
    return meta.slice(0, 20).map((item) => sanitizeMeta(item));
  }
  if (typeof meta === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      const lower = k.toLowerCase();
      if (
        lower.includes("authorization") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("password") ||
        lower === "api_key" ||
        lower === "apikey"
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeMeta(v);
      }
    }
    return out;
  }
  return String(meta);
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  setLevel(level: LogLevel | undefined): void;
  getLevel(): LogLevel;
  child(context: Record<string, unknown>): Logger;
}

export function createLogger(
  service: string = SERVER.NAME,
  fixedLevel?: LogLevel,
  baseContext: Record<string, unknown> = {}
): Logger {
  let overrideLevel: LogLevel | undefined = fixedLevel;

  const currentLevel = (): LogLevel => overrideLevel ?? readEnvLogLevel();

  const shouldLog = (level: LogLevel): boolean =>
    LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel()];

  const emit = (level: Exclude<LogLevel, "silent">, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;

    const mergedMeta =
      Object.keys(baseContext).length > 0 || (meta && Object.keys(meta).length > 0)
        ? (sanitizeMeta({ ...baseContext, ...(meta ?? {}) }) as Record<string, unknown>)
        : undefined;

    const entry = {
      ts: new Date().toISOString(),
      level,
      service,
      msg: LOGGING.DEFAULT_SANITIZE ? maskSensitiveText(message, 500) : message,
      ...(mergedMeta ? { meta: mergedMeta } : {}),
    };

    // Never write to stdout (reserved for MCP JSON-RPC frames in stdio mode)
    console.error(JSON.stringify(entry));
  };

  return {
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
    setLevel: (level) => {
      overrideLevel = level;
    },
    getLevel: currentLevel,
    child: (context) => createLogger(service, overrideLevel, { ...baseContext, ...context }),
  };
}

export const logger = createLogger(SERVER.NAME);
