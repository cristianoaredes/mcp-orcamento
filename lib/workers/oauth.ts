/**
 * OAuth 2.0 metadata & endpoint handlers for MCP remote clients (RFC 8414 / RFC 9728).
 * Zero hardcoded secrets and zero `node:*` imports.
 */

import { SERVER } from "../shared/utils/constants.js";
import { constantTimeEqual } from "./auth.js";
import type { WorkerEnv } from "./types.js";

function resolveIssuer(request: Request, env: WorkerEnv): string {
  if (typeof env.OAUTH_ISSUER === "string" && env.OAUTH_ISSUER.trim().length > 0) {
    return env.OAUTH_ISSUER.trim().replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

function getAllowedRedirectUris(env: WorkerEnv): string[] {
  if (typeof env.OAUTH_REDIRECT_URIS !== "string" || env.OAUTH_REDIRECT_URIS.trim().length === 0) {
    return [];
  }
  return env.OAUTH_REDIRECT_URIS.split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

export function handleOAuthMetadata(
  request: Request,
  env: WorkerEnv,
  headers: Record<string, string> = {}
): Response {
  const url = new URL(request.url);
  const issuer = resolveIssuer(request, env);

  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return new Response(
      JSON.stringify({
        resource: `${issuer}/mcp`,
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
        resource_name: SERVER.NAME,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      }
    );
  }

  return new Response(
    JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      service_documentation: `${issuer}/openapi.json`,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    }
  );
}

export function handleOAuthAuthorize(
  request: Request,
  env: WorkerEnv,
  headers: Record<string, string> = {}
): Response {
  if (!env.OAUTH_CLIENT_ID) {
    return new Response(
      JSON.stringify({
        error: "unsupported_operation",
        error_description: "OAuth authorization is not enabled on this deployment",
      }),
      { status: 501, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";

  if (!constantTimeEqual(clientId, env.OAUTH_CLIENT_ID)) {
    return new Response(
      JSON.stringify({ error: "unauthorized_client", error_description: "Unknown client_id" }),
      { status: 400, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  const allowedRedirects = getAllowedRedirectUris(env);
  if (allowedRedirects.length === 0 || !allowedRedirects.includes(redirectUri)) {
    return new Response(
      JSON.stringify({ error: "invalid_request", error_description: "Disallowed redirect_uri" }),
      { status: 400, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  if (responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256") {
    return new Response(
      JSON.stringify({
        error: "invalid_request",
        error_description: "response_type=code and PKCE S256 code_challenge are required",
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  return new Response(
    JSON.stringify({
      error: "unsupported_operation",
      error_description: "Interactive OAuth consent screen requires external IdP delegation",
    }),
    { status: 501, headers: { "Content-Type": "application/json", ...headers } }
  );
}

export async function handleOAuthToken(
  request: Request,
  env: WorkerEnv,
  headers: Record<string, string> = {}
): Promise<Response> {
  if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({
        error: "unsupported_operation",
        error_description: "OAuth token issuance is not configured on this deployment",
      }),
      { status: 501, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "invalid_request", error_description: "POST required" }),
      { status: 405, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  const bodyText = await request.text();
  const params = new URLSearchParams(bodyText);
  const grantType = params.get("grant_type") ?? "";
  const clientId = params.get("client_id") ?? "";
  const clientSecret = params.get("client_secret") ?? "";

  if (
    !constantTimeEqual(clientId, env.OAUTH_CLIENT_ID) ||
    !constantTimeEqual(clientSecret, env.OAUTH_CLIENT_SECRET)
  ) {
    return new Response(
      JSON.stringify({ error: "invalid_client", error_description: "Invalid client credentials" }),
      { status: 401, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  if (grantType !== "client_credentials" && grantType !== "authorization_code") {
    return new Response(
      JSON.stringify({ error: "unsupported_grant_type" }),
      { status: 400, headers: { "Content-Type": "application/json", ...headers } }
    );
  }

  return new Response(
    JSON.stringify({
      error: "unsupported_operation",
      error_description: "Configure a stateless signing key or external IdP to mint OAuth tokens",
    }),
    { status: 501, headers: { "Content-Type": "application/json", ...headers } }
  );
}
