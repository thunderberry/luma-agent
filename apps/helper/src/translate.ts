import type { FetchLumaEventResponse } from './contract.js';
import {
  FetchLumaEventRequestSchema,
} from './contract.js';
import {
  hashString,
  isoNow,
} from './shared-utils.js';

import { extractStructuredPageDataFromHtml } from './extractor.js';

export interface FetchHtmlResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  fetchedAt: string;
}

function baseResponseFields(): Pick<FetchLumaEventResponse, 'host_names' | 'category_names'> {
  return {
    host_names: [],
    category_names: [],
  };
}

function defaultUserAgent(env: NodeJS.ProcessEnv): string {
  return env.USER_AGENT ?? 'luma-agent-helper/0.1 (+https fetch)';
}

export async function fetchLumaHtml(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchHtmlResult> {
  const timeoutMs = Number.parseInt(env.FETCH_TIMEOUT_MS ?? '10000', 10);
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': defaultUserAgent(env),
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 10000),
  });

  return {
    requestedUrl: url,
    finalUrl: response.url || url,
    status: response.status,
    ok: response.ok,
    html: await response.text(),
    fetchedAt: isoNow(),
  };
}

export function translateFetchedPage(result: FetchHtmlResult): FetchLumaEventResponse {
  if (!result.ok) {
    return {
      ...baseResponseFields(),
      page_fetch_status: 'http_error',
      page_fetch_error: `HTTP ${result.status}`,
      last_verified_at: result.fetchedAt,
      content_hash: hashString(`${result.requestedUrl}:http_error:${result.status}`),
    };
  }

  const extracted = extractStructuredPageDataFromHtml(result.html);
  const hashSource = extracted ? JSON.stringify(extracted) : result.html;

  return {
    ...baseResponseFields(),
    ...(extracted ?? {}),
    page_fetch_status: 'ok',
    last_verified_at: result.fetchedAt,
    content_hash: hashString(hashSource),
  };
}

export async function translateLumaEvent(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchLumaEventResponse> {
  const parsed = FetchLumaEventRequestSchema.parse({ url: rawUrl });

  try {
    const result = await fetchLumaHtml(parsed.url, env, fetchImpl);
    return translateFetchedPage(result);
  } catch (error) {
    return {
      ...baseResponseFields(),
      page_fetch_status: 'fetch_error',
      page_fetch_error: error instanceof Error ? error.message : String(error),
      last_verified_at: isoNow(),
      content_hash: hashString(`${parsed.url}:fetch_error`),
    };
  }
}
