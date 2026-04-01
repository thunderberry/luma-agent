import type { FetchLumaEventResponse } from './contract.js';
import {
  FetchLumaEventRequestSchema,
} from './contract.js';
import {
  canonicalizeLumaUrl,
  hashString,
  isoNow,
} from './shared-utils.js';

import { extractEventPageFactsFromHtml } from './extractor.js';
import { classifyRegistrationStatus } from './status.js';

export interface FetchHtmlResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  fetchedAt: string;
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
  const canonicalUrl = canonicalizeLumaUrl(result.requestedUrl);
  if (!canonicalUrl) {
    throw new Error(`Invalid Luma URL: ${result.requestedUrl}`);
  }

  if (!result.ok) {
    return {
      url: result.requestedUrl,
      canonical_url: canonicalUrl,
      final_url: result.finalUrl,
      location_type: 'unknown',
      price_type: 'unknown',
      registration_status: 'unknown',
      organizer_names: [],
      speaker_names: [],
      popularity_signals: [],
      page_fetch_status: 'http_error',
      page_fetch_error: `HTTP ${result.status}`,
      last_verified_at: result.fetchedAt,
      content_hash: hashString(`${canonicalUrl}:http_error:${result.status}`),
    };
  }

  const extracted = extractEventPageFactsFromHtml(result.html);

  return {
    url: result.requestedUrl,
    canonical_url: canonicalUrl,
    final_url: result.finalUrl,
    ...(extracted.title ? { title: extracted.title } : {}),
    ...(extracted.starts_at ? { starts_at: extracted.starts_at } : {}),
    ...(extracted.city ? { city: extracted.city } : {}),
    ...(extracted.venue ? { venue: extracted.venue } : {}),
    location_type: extracted.location_type,
    price_type: extracted.price_type,
    ...(extracted.price_text ? { price_text: extracted.price_text } : {}),
    registration_status: classifyRegistrationStatus(extracted.page_text, extracted.cta_texts),
    organizer_names: extracted.organizer_names,
    speaker_names: extracted.speaker_names,
    ...(extracted.description_excerpt ? { description_excerpt: extracted.description_excerpt } : {}),
    popularity_signals: extracted.popularity_signals,
    page_fetch_status: 'ok',
    last_verified_at: result.fetchedAt,
    content_hash: hashString(extracted.page_text || result.html),
  };
}

export async function translateLumaEvent(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchLumaEventResponse> {
  const parsed = FetchLumaEventRequestSchema.parse({ url: rawUrl });
  const canonicalUrl = canonicalizeLumaUrl(parsed.url);
  if (!canonicalUrl) {
    throw new Error(`Unsupported Luma URL: ${parsed.url}`);
  }

  try {
    const result = await fetchLumaHtml(parsed.url, env, fetchImpl);
    return translateFetchedPage(result);
  } catch (error) {
    return {
      url: parsed.url,
      canonical_url: canonicalUrl,
      location_type: 'unknown',
      price_type: 'unknown',
      registration_status: 'unknown',
      organizer_names: [],
      speaker_names: [],
      popularity_signals: [],
      page_fetch_status: 'fetch_error',
      page_fetch_error: error instanceof Error ? error.message : String(error),
      last_verified_at: isoNow(),
      content_hash: hashString(`${canonicalUrl}:fetch_error`),
    };
  }
}
