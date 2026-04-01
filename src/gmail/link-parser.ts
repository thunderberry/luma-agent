import type { gmail_v1 } from 'googleapis';

import type { InviteLink } from '../types/index.js';

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;
const HREF_REGEX = /href\s*=\s*["']([^"']+)["']/gi;

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function stripTrailingJunk(value: string): string {
  return value.replace(/[),.;!?]+$/g, '').trim();
}

function isLumaHostname(hostname: string): boolean {
  return hostname === 'lu.ma' || hostname === 'www.lu.ma' || hostname.endsWith('.lu.ma');
}

function toCanonicalUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    let host = parsed.hostname.toLowerCase();
    if (host === 'www.lu.ma') {
      host = 'lu.ma';
    }
    if (!isLumaHostname(host)) {
      return null;
    }

    const pathname = parsed.pathname.replace(/\/+$/g, '') || '/';
    return `${parsed.protocol}//${host}${pathname}`;
  } catch {
    return null;
  }
}

function toRawUrl(candidate: string): string | null {
  const cleaned = stripTrailingJunk(decodeHtmlEntities(candidate));
  try {
    const parsed = new URL(cleaned);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function collectPartBodies(
  part: gmail_v1.Schema$MessagePart | undefined,
  textBodies: string[],
  htmlBodies: string[],
): void {
  if (!part) {
    return;
  }

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType?.includes('text/plain')) {
      textBodies.push(decoded);
    }
    if (part.mimeType?.includes('text/html')) {
      htmlBodies.push(decoded);
    }
  }

  for (const child of part.parts ?? []) {
    collectPartBodies(child, textBodies, htmlBodies);
  }
}

export function extractLumaUrlsFromMessagePart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string[] {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];
  collectPartBodies(payload, textBodies, htmlBodies);

  const candidates: string[] = [];

  for (const text of textBodies) {
    const matches = text.match(URL_REGEX);
    if (matches) {
      candidates.push(...matches);
    }
  }

  for (const html of htmlBodies) {
    const regex = new RegExp(HREF_REGEX.source, HREF_REGEX.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      if (href) {
        candidates.push(href);
      }
    }

    const matches = html.match(URL_REGEX);
    if (matches) {
      candidates.push(...matches);
    }
  }

  const finalUrls = new Set<string>();

  for (const candidate of candidates) {
    const rawUrl = toRawUrl(candidate);
    if (!rawUrl) {
      continue;
    }
    const canonicalUrl = toCanonicalUrl(rawUrl);
    if (!canonicalUrl) {
      continue;
    }

    finalUrls.add(rawUrl);
  }

  return [...finalUrls];
}

export function canonicalizeInviteUrl(rawUrl: string): string | null {
  return toCanonicalUrl(rawUrl);
}

export function extractPlainTextFromMessagePart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];
  collectPartBodies(payload, textBodies, htmlBodies);

  const textContent = textBodies.join('\n').trim();
  if (textContent) {
    return textContent;
  }

  return decodeHtmlEntities(stripTags(htmlBodies.join('\n')))
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function dedupeInvites(invites: InviteLink[]): InviteLink[] {
  const byCanonical = new Map<string, InviteLink>();

  for (const invite of invites) {
    const existing = byCanonical.get(invite.canonicalUrl);
    if (!existing) {
      byCanonical.set(invite.canonicalUrl, invite);
      continue;
    }

    if (new Date(invite.receivedAt).getTime() > new Date(existing.receivedAt).getTime()) {
      byCanonical.set(invite.canonicalUrl, invite);
    }
  }

  return [...byCanonical.values()];
}
