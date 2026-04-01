import { createHash } from 'node:crypto';

import { z } from 'zod';

export const FetchLumaEventRequestSchema = z.object({
  url: z.string().url(),
});

export const FetchLumaEventResponseSchema = z.object({
  title: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  url: z.string().url().optional(),
  city: z.string().optional(),
  host_names: z.array(z.string()),
  waitlist: z.string().nullable().optional(),
  ticket_price: z.string().nullable().optional(),
  sold_out: z.boolean().optional(),
  has_available_ticket_types: z.boolean().optional(),
  category_names: z.array(z.string()),
  calendar_name: z.string().optional(),
  calendar_description_short: z.string().optional(),
  description: z.string().optional(),
  page_fetch_status: z.enum(['ok', 'http_error', 'fetch_error']),
  page_fetch_error: z.string().optional(),
  last_verified_at: z.string(),
  content_hash: z.string(),
});

export type FetchLumaEventRequest = z.infer<typeof FetchLumaEventRequestSchema>;
export type FetchLumaEventResponse = z.infer<typeof FetchLumaEventResponseSchema>;

export interface CachedMessageRecord {
  message_id: string;
  thread_id?: string;
  sender?: string;
  subject?: string;
  snippet?: string;
  received_at: string;
  extracted_urls: string[];
  invite_signals: string[];
  processed_at: string;
}

export interface CachedEventRecord {
  canonical_url: string;
  url_hash: string;
  source_message_ids: string[];
  helper_response?: FetchLumaEventResponse;
  first_seen_at: string;
  last_seen_at: string;
  last_fetched_at?: string;
  next_refresh_at?: string;
  content_hash?: string;
}

export interface EventArtifactRecord {
  slug: string;
  canonical_url: string;
  source_messages: CachedMessageRecord[];
  helper_response?: FetchLumaEventResponse;
}

export interface UpcomingEventsReport {
  run_date: string;
  generated_at: string;
  timezone: string;
  events: EventArtifactRecord[];
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function localDateStamp(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isUpcoming(isoDate: string | undefined, now = new Date()): boolean {
  if (!isoDate) {
    return true;
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  return parsed.getTime() >= now.getTime();
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

export function hashString(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

export function urlHash(url: string): string {
  return hashString(url).slice(0, 16);
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

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'event'
  );
}

export function eventSlug(record: {
  canonical_url: string;
  helper_response?: FetchLumaEventResponse;
}): string {
  const title = helperEventTitle(record.helper_response);
  if (title) {
    return slugify(title);
  }

  try {
    const parsed = new URL(record.canonical_url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    if (lastSegment) {
      return slugify(lastSegment);
    }
  } catch {
    return slugify(record.canonical_url);
  }

  return 'event';
}

export function helperEventTitle(event: FetchLumaEventResponse | undefined): string | undefined {
  return event?.title?.trim() || undefined;
}

export function helperEventStartAt(event: FetchLumaEventResponse | undefined): string | undefined {
  return event?.start_at;
}

export function helperHostNames(event: FetchLumaEventResponse | undefined): string[] {
  return event?.host_names ?? [];
}

export function formatCompactLocation(event: FetchLumaEventResponse | undefined): string {
  if (!event) {
    return 'unknown location';
  }

  return event.city?.trim() || 'unknown location';
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

export function computeNextRefreshAt(
  event: FetchLumaEventResponse | undefined,
  now = new Date(),
): string | undefined {
  const startsAtIso = helperEventStartAt(event);
  if (!startsAtIso) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const diffMs = startsAt.getTime() - now.getTime();
  if (diffMs < 0) {
    return undefined;
  }

  const diffDays = diffMs / (24 * 60 * 60 * 1000);
  if (diffDays <= 7) {
    return now.toISOString();
  }

  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function shouldRefreshCachedEvent(
  record: CachedEventRecord | undefined,
  now = new Date(),
): boolean {
  if (!record?.helper_response || !record.last_fetched_at) {
    return true;
  }

  const fetchedAt = new Date(record.last_fetched_at);
  if (Number.isNaN(fetchedAt.getTime())) {
    return true;
  }

  const startsAtIso = helperEventStartAt(record.helper_response);
  const startsAt = startsAtIso
    ? new Date(startsAtIso)
    : undefined;

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return now.getTime() - fetchedAt.getTime() >= 24 * 60 * 60 * 1000;
  }

  if (startsAt.getTime() < now.getTime()) {
    return false;
  }

  const diffDays = (startsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays <= 7) {
    return true;
  }

  return now.getTime() - fetchedAt.getTime() >= 24 * 60 * 60 * 1000;
}

export function renderEventMarkdown(record: EventArtifactRecord): string {
  const lines: string[] = [];
  const event = record.helper_response;
  const title = helperEventTitle(event) ?? record.canonical_url;

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- URL: ${record.canonical_url}`);
  lines.push(`- Starts: ${helperEventStartAt(event) ?? 'unknown'}`);
  lines.push(`- Location: ${formatCompactLocation(event)}`);
  lines.push(`- Hosts: ${helperHostNames(event).join(', ') || 'unknown'}`);
  lines.push(`- Waitlist: ${event?.waitlist ?? 'none'}`);
  lines.push(`- Ticket Price: ${event?.ticket_price ?? 'unknown'}`);
  lines.push(`- Sold Out: ${event?.sold_out ?? 'unknown'}`);
  lines.push(`- Fetch Status: ${event?.page_fetch_status ?? 'unknown'}`);
  if (event?.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(event.description);
  }
  if (record.source_messages.length) {
    lines.push('');
    lines.push('## Source Messages');
    for (const message of record.source_messages) {
      lines.push(
        `- ${message.received_at} | ${message.subject ?? 'No subject'} | ${message.sender ?? 'unknown sender'}`,
      );
    }
  }

  return lines.join('\n');
}

export function renderUpcomingReportMarkdown(report: UpcomingEventsReport): string {
  const lines: string[] = [];
  lines.push(`# Upcoming Luma Events (${report.run_date})`);
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Timezone: ${report.timezone}`);
  lines.push('');

  for (const event of report.events) {
    const response = event.helper_response;
    const title = helperEventTitle(response) ?? event.canonical_url;
    lines.push(`## ${title}`);
    lines.push(`- URL: ${event.canonical_url}`);
    lines.push(`- Starts: ${helperEventStartAt(response) ?? 'unknown'}`);
    lines.push(`- Location: ${formatCompactLocation(response)}`);
    lines.push(`- Hosts: ${helperHostNames(response).join(', ') || 'unknown'}`);
    lines.push(`- Waitlist: ${response?.waitlist ?? 'none'}`);
    lines.push(`- Ticket Price: ${response?.ticket_price ?? 'unknown'}`);
    lines.push(`- Sold Out: ${response?.sold_out ?? 'unknown'}`);
    lines.push(`- Fetch Status: ${response?.page_fetch_status ?? 'unknown'}`);
    if (response?.description) {
      lines.push(`- Description: ${response.description}`);
    }
    lines.push('');
  }

  if (report.events.length === 0) {
    lines.push('No upcoming events found.');
  }

  return lines.join('\n');
}
