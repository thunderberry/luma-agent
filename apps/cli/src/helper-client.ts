import {
  FetchLumaEventResponseSchema,
  type FetchLumaEventResponse,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';

function resolveFetchEventUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/g, '')}/api/fetch-event`;
}

export async function fetchHelperEvent(
  config: CliConfig,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchLumaEventResponse> {
  if (!config.helperBaseUrl || !config.helperBearerToken || !config.helperClientId) {
    throw new Error(
      'Missing helper configuration. Set LUMA_HELPER_BASE_URL, LUMA_HELPER_BEARER_TOKEN, and LUMA_HELPER_CLIENT_ID.',
    );
  }

  const response = await fetchImpl(resolveFetchEventUrl(config.helperBaseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.helperBearerToken}`,
      'x-client-id': config.helperClientId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Helper request failed with ${response.status}: ${await response.text()}`);
  }

  return FetchLumaEventResponseSchema.parse(await response.json());
}
