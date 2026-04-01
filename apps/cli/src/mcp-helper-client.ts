import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  type FetchLumaEventResponse,
  FetchLumaEventResponseSchema,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';

function resolveMcpUrl(baseUrl: string): URL {
  return new URL(`${baseUrl.replace(/\/+$/g, '')}/api/mcp`);
}

function createClientTransport(config: CliConfig): StreamableHTTPClientTransport {
  if (!config.helperBaseUrl || !config.helperBearerToken || !config.helperClientId) {
    throw new Error(
      'Missing helper configuration. Set LUMA_HELPER_BASE_URL, LUMA_HELPER_BEARER_TOKEN, and LUMA_HELPER_CLIENT_ID.',
    );
  }

  return new StreamableHTTPClientTransport(resolveMcpUrl(config.helperBaseUrl), {
    requestInit: {
      headers: {
        authorization: `Bearer ${config.helperBearerToken}`,
        'x-client-id': config.helperClientId,
      },
    },
  });
}

export async function fetchHelperFactsViaMcp(
  config: CliConfig,
  urls: string[],
): Promise<FetchLumaEventResponse[]> {
  if (urls.length === 0) {
    return [];
  }

  const transport = createClientTransport(config);
  const client = new Client({
    name: 'luma-agent-cli',
    version: '0.1.0',
  });

  await client.connect(transport as never);

  try {
    const results: FetchLumaEventResponse[] = [];

    for (const url of urls) {
      const toolResult = await client.callTool({
        name: 'fetch_luma_event',
        arguments: { url },
      });

      const structured = toolResult.structuredContent as { result?: unknown } | undefined;
      results.push(FetchLumaEventResponseSchema.parse(structured?.result));
    }

    return results;
  } finally {
    await transport.close();
  }
}
