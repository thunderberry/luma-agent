import { createHash } from 'node:crypto';

export function isoNow(): string {
  return new Date().toISOString();
}

export function hashString(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function isSupportedLumaHostname(hostname: string): boolean {
  return (
    hostname === 'lu.ma'
    || hostname === 'www.lu.ma'
    || hostname.endsWith('.lu.ma')
    || hostname === 'luma.com'
    || hostname === 'www.luma.com'
    || hostname.endsWith('.luma.com')
  );
}

export function canonicalizeLumaUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!isSupportedLumaHostname(host)) {
      return null;
    }

    const normalizedHost = host === 'www.lu.ma' || host === 'www.luma.com' || host === 'luma.com'
      ? 'lu.ma'
      : host.endsWith('.luma.com')
        ? host.replace(/\.luma\.com$/, '.lu.ma')
        : host;

    parsed.protocol = 'https:';
    parsed.hostname = normalizedHost;
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/g, '') || '/';

    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

export function normalizeText(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(value)));
}

export function limitText(value: string | undefined, maxLength = 240): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}
