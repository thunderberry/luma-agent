import type { IncomingMessage, ServerResponse } from 'node:http';

import { isoNow } from '../src/shared-utils.js';

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function hasConfiguredValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  const authTokenConfigured = hasConfiguredValue(process.env.MCP_BEARER_TOKEN);
  const allowedClientIdsConfigured = hasConfiguredValue(process.env.MCP_ALLOWED_CLIENT_IDS);
  const fetchTimeoutMs = process.env.FETCH_TIMEOUT_MS?.trim() ?? null;

  const ok = authTokenConfigured && allowedClientIdsConfigured;

  json(res, ok ? 200 : 503, {
    ok,
    service: 'luma-agent-helper',
    status: ok ? 'healthy' : 'misconfigured',
    timestamp: isoNow(),
    checks: {
      authTokenConfigured,
      allowedClientIdsConfigured,
    },
    config: {
      fetchTimeoutMs,
    },
  });
}
