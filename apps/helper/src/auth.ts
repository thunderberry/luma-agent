import type { IncomingHttpHeaders } from 'node:http';

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  clientId?: string;
}

function singleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseAllowedClientIds(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.MCP_ALLOWED_CLIENT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function authenticateHeaders(
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
): AuthResult {
  const authorization = singleHeaderValue(headers.authorization);
  if (!authorization?.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'Missing bearer token.',
    };
  }

  const token = authorization.slice('Bearer '.length).trim();
  const expectedToken = env.MCP_BEARER_TOKEN?.trim();
  if (!expectedToken || token !== expectedToken) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid bearer token.',
    };
  }

  const clientId = singleHeaderValue(headers['x-client-id'])?.trim();
  if (!clientId) {
    return {
      ok: false,
      status: 401,
      error: 'Missing X-Client-Id header.',
    };
  }

  const allowedClientIds = parseAllowedClientIds(env);
  if (allowedClientIds.size === 0 || !allowedClientIds.has(clientId)) {
    return {
      ok: false,
      status: 403,
      error: 'Client is not allowed.',
    };
  }

  return {
    ok: true,
    status: 200,
    clientId,
  };
}
