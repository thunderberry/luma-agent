import { createHash } from 'node:crypto';

import { isoNow } from '../util/date.js';

export interface EventPageFetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType?: string;
  contentLength: number;
  contentLengthSource: 'header' | 'body_bytes';
  fetchedAt: string;
  html: string;
  htmlExcerpt: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeContentType(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveContentLength(
  headerValue: string | null,
  html: string,
): Pick<EventPageFetchResult, 'contentLength' | 'contentLengthSource'> {
  const parsed = headerValue ? Number.parseInt(headerValue, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) {
    return {
      contentLength: parsed,
      contentLengthSource: 'header',
    };
  }

  return {
    contentLength: Buffer.byteLength(html, 'utf8'),
    contentLengthSource: 'body_bytes',
  };
}

export function buildHtmlExcerpt(html: string, maxLength = 400): string {
  const normalized = normalizeWhitespace(html);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function buildFetchSlug(url: string): string {
  let base = 'event';

  try {
    const parsed = new URL(url);
    base = `${parsed.hostname}${decodeURIComponent(parsed.pathname)}`;
  } catch {
    base = url;
  }

  const normalizedBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'event';
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8);

  return `${normalizedBase}-${hash}`;
}

export async function fetchEventPageHtml(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<EventPageFetchResult> {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'luma-agent/0.1 (+phase0 retrieval proof)',
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const html = await response.text();
  const contentLength = resolveContentLength(response.headers.get('content-length'), html);
  const contentType = normalizeContentType(response.headers.get('content-type'));

  return {
    requestedUrl: url,
    finalUrl: response.url || url,
    status: response.status,
    ok: response.ok,
    contentLength: contentLength.contentLength,
    contentLengthSource: contentLength.contentLengthSource,
    fetchedAt: isoNow(),
    html,
    htmlExcerpt: buildHtmlExcerpt(html),
    ...(contentType ? { contentType } : {}),
  };
}
