/**
 * Node configuration loader (.mcprc.json + env) and SSRF-safe API config resolution.
 */

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigurationError } from "../shared/errors.js";
import {
  ALLOWED_TESOURO_CKAN_HOSTS,
  ALLOWED_TESOURO_ORDS_HOSTS,
  ALLOWED_TRANSFEREGOV_HOSTS,
  API_URLS,
  CACHE,
  isAllowedTesouroCkanUrl,
  isAllowedTesouroOrdsUrl,
  isAllowedTransferegovUrl,
  isLoopbackHost,
  SERVER,
  validateUrl,
  type ValidateUrlOptions,
} from "../shared/utils/constants.js";
import type { ApiConfig, ConfigFile, ServerConfig } from "../types/index.js";
import { parsePositiveTimeoutMs, TIMEOUTS } from "./timeouts.js";

export const SERVER_NAME = SERVER.NAME;
export const SERVER_VERSION = SERVER.VERSION;

export const DEFAULT_TESOURO_ORDS_URL = API_URLS.DEFAULT_TESOURO_ORDS;
export const DEFAULT_TRANSFEREGOV_URL = API_URLS.DEFAULT_TRANSFEREGOV;
export const DEFAULT_TESOURO_CKAN_URL = API_URLS.DEFAULT_TESOURO_CKAN;

export {
  ALLOWED_TESOURO_CKAN_HOSTS,
  ALLOWED_TESOURO_ORDS_HOSTS,
  ALLOWED_TRANSFEREGOV_HOSTS,
  isAllowedTesouroCkanUrl,
  isAllowedTesouroOrdsUrl,
  isAllowedTransferegovUrl,
  isLoopbackHost,
  validateUrl,
  type ValidateUrlOptions,
};

export interface ApiConfigOverrides {
  tesouroOrdsBaseUrl?: string;
  transferegovBaseUrl?: string;
  tesouroCkanBaseUrl?: string;
  authHeaders?: Record<string, string>;
  configFilePath?: string;
  allowLoopback?: boolean;
  env?: string;
}

function getEnv(key: string): string | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }
  return process.env[key];
}

export function loadConfigFile(customPath?: string): ConfigFile {
  const candidates: string[] = [];
  if (customPath) {
    candidates.push(customPath);
  } else {
    const envPath = getEnv("MCPRC_PATH");
    if (envPath) {
      candidates.push(envPath);
    }
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      candidates.push(path.join(process.cwd(), ".mcprc.json"));
    }
    if (typeof os.homedir === "function") {
      candidates.push(path.join(os.homedir(), ".mcprc.json"));
    }
  }

  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) {
        continue;
      }
      const raw = readFileSync(filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new ConfigurationError(`Invalid .mcprc.json structure in ${filePath}`);
      }
      return parsed as ConfigFile;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      throw new ConfigurationError(
        `Failed to parse config file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {};
}

export function resolveApiConfig(overrides: ApiConfigOverrides = {}): ApiConfig {
  const fileConfig = overrides.configFilePath
    ? loadConfigFile(overrides.configFilePath)
    : typeof process !== "undefined"
      ? loadConfigFile()
      : {};

  const rawTesouroOrds =
    overrides.tesouroOrdsBaseUrl ??
    getEnv("TESOURO_ORDS_BASE_URL") ??
    fileConfig.apiUrls?.tesouroOrds ??
    DEFAULT_TESOURO_ORDS_URL;

  const rawTransferegov =
    overrides.transferegovBaseUrl ??
    getEnv("TRANSFEREGOV_BASE_URL") ??
    fileConfig.apiUrls?.transferegov ??
    DEFAULT_TRANSFEREGOV_URL;

  const rawTesouroCkan =
    overrides.tesouroCkanBaseUrl ??
    getEnv("TESOURO_CKAN_BASE_URL") ??
    fileConfig.apiUrls?.tesouroCkan ??
    DEFAULT_TESOURO_CKAN_URL;

  const urlOpts: Omit<ValidateUrlOptions, "allowedHosts"> = {
    allowLoopback: overrides.allowLoopback,
    env: overrides.env,
  };

  const tesouroOrdsBaseUrl = validateUrl(rawTesouroOrds, {
    ...urlOpts,
    allowedHosts: ALLOWED_TESOURO_ORDS_HOSTS,
  });
  const transferegovBaseUrl = validateUrl(rawTransferegov, {
    ...urlOpts,
    allowedHosts: ALLOWED_TRANSFEREGOV_HOSTS,
  });
  const tesouroCkanBaseUrl = validateUrl(rawTesouroCkan, {
    ...urlOpts,
    allowedHosts: ALLOWED_TESOURO_CKAN_HOSTS,
  });

  const mergedHeaders: Record<string, string> = {
    ...(fileConfig.auth?.headers ?? {}),
  };

  const apiKeyHeader = getEnv("API_KEY_HEADER");
  const apiKeyValue = getEnv("API_KEY_VALUE");
  if (apiKeyHeader && apiKeyValue) {
    mergedHeaders[apiKeyHeader] = apiKeyValue;
  }

  if (overrides.authHeaders) {
    Object.assign(mergedHeaders, overrides.authHeaders);
  }

  return {
    tesouroOrdsBaseUrl,
    transferegovBaseUrl,
    tesouroCkanBaseUrl,
    ...(Object.keys(mergedHeaders).length > 0 ? { authHeaders: mergedHeaders } : {}),
  };
}

export function loadServerConfiguration(overrides: ApiConfigOverrides = {}): {
  apiConfig: ApiConfig;
  serverConfig: ServerConfig;
} {
  const apiConfig = resolveApiConfig(overrides);

  const rawPort = getEnv("MCP_HTTP_PORT");
  const parsedPort =
    rawPort && /^\d+$/.test(rawPort.trim()) ? Number(rawPort.trim()) : SERVER.DEFAULT_HTTP_PORT;
  const httpPort = parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : SERVER.DEFAULT_HTTP_PORT;

  const cacheSize = parsePositiveTimeoutMs(getEnv("MCP_CACHE_SIZE"), CACHE.DEFAULT_SIZE);
  const cacheTTL = parsePositiveTimeoutMs(getEnv("MCP_CACHE_TTL"), CACHE.DEFAULT_TTL_MS);
  const apiTimeout = parsePositiveTimeoutMs(getEnv("MCP_API_TIMEOUT"), TIMEOUTS.HTTP_REQUEST_MS);

  const transport = (getEnv("MCP_TRANSPORT") || SERVER.DEFAULT_TRANSPORT).trim().toLowerCase();
  const httpHost = getEnv("MCP_HTTP_HOST")?.trim() || undefined;

  return {
    apiConfig,
    serverConfig: {
      transport,
      httpPort,
      ...(httpHost ? { httpHost } : {}),
      cacheSize,
      cacheTTL,
      apiTimeout,
    },
  };
}
