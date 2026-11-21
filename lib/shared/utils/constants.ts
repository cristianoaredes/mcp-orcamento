/**
 * Application Constants and Web-standard SSRF URL validation helpers.
 * Zero `node:*` imports so Cloudflare Workers and Node share one source of truth.
 */

import { ConfigurationError } from "../errors.js";

export const CIRCUIT_BREAKER = {
  /** Number of failures before opening circuit */
  FAILURE_THRESHOLD: 5,

  /** Max attempts in HALF_OPEN state */
  HALF_OPEN_MAX_ATTEMPTS: 3,
} as const;

export const API_URLS = {
  /** Default Tesouro Nacional ORDS API base URL (SICONFI & SADIPEM) */
  DEFAULT_TESOURO_ORDS: "https://apidatalake.tesouro.gov.br/ords/",

  /** Default Transferegov PostgREST API base URL */
  DEFAULT_TRANSFEREGOV: "https://api.transferegov.gestao.gov.br/",

  /** Default Tesouro Transparente CKAN API base URL */
  DEFAULT_TESOURO_CKAN: "https://www.tesourotransparente.gov.br/ckan/api/3/action/",
} as const;

export const ALLOWED_TESOURO_ORDS_HOSTS = ["apidatalake.tesouro.gov.br"] as const;
export const ALLOWED_TRANSFEREGOV_HOSTS = ["api.transferegov.gestao.gov.br"] as const;
export const ALLOWED_TESOURO_CKAN_HOSTS = [
  "www.tesourotransparente.gov.br",
  "tesourotransparente.gov.br",
] as const;

export const SERVER = {
  /** Server name */
  NAME: "mcp-orcamento",

  /** Server version (aligned with package.json) */
  VERSION: "0.1.0",

  /** Default transport mode */
  DEFAULT_TRANSPORT: "stdio",

  /** Default HTTP port */
  DEFAULT_HTTP_PORT: 3000,
} as const;

export const CACHE = {
  /** Default cache size (number of entries) */
  DEFAULT_SIZE: 256,

  /** Default cache TTL in milliseconds (1 hour) */
  DEFAULT_TTL_MS: 60 * 60 * 1000,

  /** Background cleanup interval in milliseconds (5 minutes) */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,
} as const;

export const LOGGING = {
  /** Default log level */
  DEFAULT_LEVEL: "info" as const,

  /** Whether to sanitize PII by default */
  DEFAULT_SANITIZE: true,

  /** Whether to pretty print logs by default */
  DEFAULT_PRETTY_PRINT: false,
} as const;

export interface ValidateUrlOptions {
  allowedHosts?: readonly string[];
  allowLoopback?: boolean;
  env?: string;
}

function getRuntimeEnv(key: string): string | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }
  return process.env[key];
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function isPrivateOrMetadataHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "0.0.0.0" ||
    host === "metadata.google.internal" ||
    host === "metadata.aws.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }

  if (
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:169.254.") ||
    host.startsWith("::ffff:192.168.")
  ) {
    return true;
  }

  return false;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

/**
 * Validate and normalize an upstream API base URL against SSRF rules and an optional host allowlist.
 * Loopback hosts are permitted only in development/test (or when allowLoopback is explicitly true).
 */
export function validateUrl(rawUrl: string, options: ValidateUrlOptions = {}): string {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new ConfigurationError("API base URL must be a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ConfigurationError(`Invalid API base URL: ${rawUrl}`);
  }

  if (parsed.username || parsed.password) {
    throw new ConfigurationError("API base URL must not contain embedded credentials");
  }

  const effectiveEnv = (options.env ?? getRuntimeEnv("NODE_ENV") ?? "").trim().toLowerCase();
  const isDevOrTest = effectiveEnv === "development" || effectiveEnv === "test";
  const allowLoopback = options.allowLoopback ?? isDevOrTest;

  const host = parsed.hostname.toLowerCase();
  if (isLoopbackHost(host)) {
    if (!allowLoopback) {
      throw new ConfigurationError(
        `Loopback URL '${parsed.origin}' is only permitted in development or test environments`
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ConfigurationError(`Unsupported protocol '${parsed.protocol}' for loopback URL`);
    }
    return ensureTrailingSlash(parsed.toString());
  }

  if (parsed.protocol !== "https:") {
    throw new ConfigurationError(
      `Upstream API URL must use HTTPS protocol (received '${parsed.protocol}')`
    );
  }

  if (isPrivateOrMetadataHost(host)) {
    throw new ConfigurationError(`Host '${host}' is blocked by SSRF policy`);
  }

  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const normalizedAllowed = options.allowedHosts.map((h) => h.toLowerCase());
    if (!normalizedAllowed.includes(host)) {
      throw new ConfigurationError(
        `Host '${host}' is not in allowlist: ${normalizedAllowed.join(", ")}`
      );
    }
  }

  return ensureTrailingSlash(parsed.toString());
}

export function isAllowedTesouroOrdsUrl(
  rawUrl: string,
  options: Omit<ValidateUrlOptions, "allowedHosts"> = {}
): boolean {
  try {
    validateUrl(rawUrl, { ...options, allowedHosts: ALLOWED_TESOURO_ORDS_HOSTS });
    return true;
  } catch {
    return false;
  }
}

export function isAllowedTransferegovUrl(
  rawUrl: string,
  options: Omit<ValidateUrlOptions, "allowedHosts"> = {}
): boolean {
  try {
    validateUrl(rawUrl, { ...options, allowedHosts: ALLOWED_TRANSFEREGOV_HOSTS });
    return true;
  } catch {
    return false;
  }
}

export function isAllowedTesouroCkanUrl(
  rawUrl: string,
  options: Omit<ValidateUrlOptions, "allowedHosts"> = {}
): boolean {
  try {
    validateUrl(rawUrl, { ...options, allowedHosts: ALLOWED_TESOURO_CKAN_HOSTS });
    return true;
  } catch {
    return false;
  }
}
