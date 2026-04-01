import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  FetchLumaEventRequestSchema,
  FetchLumaEventResponseSchema,
} from './contract.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { authenticateHeaders } from './auth.js';
import { enforceRateLimit } from './rate-limit.js';
import { isoNow } from './shared-utils.js';
import { translateLumaEvent } from './translate.js';

type RequestLike = IncomingMessage & { body?: unknown };

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body: unknown): unknown {
  if (typeof body === 'string' && body.trim()) {
    return JSON.parse(body);
  }
  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString('utf8'));
  }
  return body;
}

function logRequest(req: IncomingMessage, clientId: string): void {
  const now = new Date().toISOString();
  process.stdout.write(
    `[${now}] helper request client=${clientId} method=${req.method ?? 'UNKNOWN'} path=${req.url ?? '/'}\n`,
  );
}

function createServer(): McpServer {
  const server = new McpServer({
    name: 'luma-event-helper',
    version: '0.1.0',
  });

  server.registerTool(
    'fetch_luma_event',
    {
      description: 'Fetch one Luma event page and return compact event facts.',
      inputSchema: {
        url: z.string().url(),
      },
      outputSchema: {
        result: FetchLumaEventResponseSchema,
      },
    },
    async ({ url }) => {
      const result = await translateLumaEvent(url);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: { result },
      };
    },
  );

  server.registerTool(
    'batch_fetch_luma_events',
    {
      description: 'Fetch up to 10 Luma event pages and return compact event facts.',
      inputSchema: {
        urls: z.array(z.string().url()).max(10),
      },
      outputSchema: {
        results: z.array(FetchLumaEventResponseSchema),
      },
    },
    async ({ urls }) => {
      const uniqueUrls = [...new Set(urls)];
      const results = await Promise.all(uniqueUrls.map((url) => translateLumaEvent(url)));
      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        structuredContent: { results },
      };
    },
  );

  server.registerTool(
    'healthcheck',
    {
      description: 'Check whether the helper is running.',
      inputSchema: {},
      outputSchema: {
        ok: z.boolean(),
        timestamp: z.string(),
      },
    },
    async () => {
      const structuredContent = {
        ok: true,
        timestamp: isoNow(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    },
  );

  return server;
}

export async function handleFetchEventRequest(
  req: RequestLike,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const auth = authenticateHeaders(req.headers, env);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const rateLimit = enforceRateLimit(auth.clientId!, env);
  if (!rateLimit.ok) {
    if (rateLimit.retryAfterSeconds) {
      res.setHeader('retry-after', String(rateLimit.retryAfterSeconds));
    }
    sendJson(res, 429, { error: 'Rate limit exceeded.' });
    return;
  }

  logRequest(req, auth.clientId!);

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const parsed = FetchLumaEventRequestSchema.parse(parseBody(req.body));
    const result = await translateLumaEvent(parsed.url, env);
    sendJson(res, 200, FetchLumaEventResponseSchema.parse(result));
  } catch (error) {
    sendJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleMcpRequest(
  req: RequestLike,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const auth = authenticateHeaders(req.headers, env);
  if (!auth.ok) {
    sendJson(res, auth.status, {
      jsonrpc: '2.0',
      error: { code: -32001, message: auth.error },
      id: null,
    });
    return;
  }

  const rateLimit = enforceRateLimit(auth.clientId!, env);
  if (!rateLimit.ok) {
    sendJson(res, 429, {
      jsonrpc: '2.0',
      error: { code: -32002, message: 'Rate limit exceeded.' },
      id: null,
    });
    return;
  }

  logRequest(req, auth.clientId!);

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
    return;
  }

  const server = createServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport as never);
    await transport.handleRequest(req, res, parseBody(req.body));
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    sendJson(res, 500, {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      id: null,
    });
  }
}
