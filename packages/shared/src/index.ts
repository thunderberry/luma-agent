import { createHash } from 'node:crypto';

import { z } from 'zod';

export const RegistrationStatusSchema = z.enum([
  'open',
  'approval_required',
  'waitlist',
  'closed',
  'unknown',
]);

export const PriceTypeSchema = z.enum(['free', 'paid', 'unknown']);
export const LocationTypeSchema = z.enum(['in_person', 'virtual', 'hybrid', 'unknown']);

export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;
export type PriceType = z.infer<typeof PriceTypeSchema>;
export type LocationType = z.infer<typeof LocationTypeSchema>;

export const FetchLumaEventRequestSchema = z.object({
  url: z.string().url(),
});

export const FetchLumaEventResponseSchema = z.object({
  url: z.string().url(),
  canonical_url: z.string().url(),
  final_url: z.string().url().optional(),
  title: z.string().optional(),
  starts_at: z.string().optional(),
  city: z.string().optional(),
  venue: z.string().optional(),
  location_type: LocationTypeSchema,
  price_type: PriceTypeSchema,
  price_text: z.string().optional(),
  registration_status: RegistrationStatusSchema,
  organizer_names: z.array(z.string()),
  speaker_names: z.array(z.string()),
  description_excerpt: z.string().optional(),
  popularity_signals: z.array(z.string()),
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
  const title = record.helper_response?.title;
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

export function formatCompactLocation(event: FetchLumaEventResponse | undefined): string {
  if (!event) {
    return 'unknown location';
  }

  return [event.venue, event.city].filter(Boolean).join(', ') || 'unknown location';
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
  if (!event?.starts_at) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const startsAt = new Date(event.starts_at);
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

  const startsAt = record.helper_response.starts_at
    ? new Date(record.helper_response.starts_at)
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
  const title = event?.title ?? record.canonical_url;

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- URL: ${record.canonical_url}`);
  lines.push(`- Starts: ${event?.starts_at ?? 'unknown'}`);
  lines.push(`- Registration: ${event?.registration_status ?? 'unknown'}`);
  lines.push(`- Price: ${event?.price_type ?? 'unknown'}${event?.price_text ? ` (${event.price_text})` : ''}`);
  lines.push(`- Location: ${formatCompactLocation(event)}`);
  lines.push(`- Organizers: ${event?.organizer_names.join(', ') || 'unknown'}`);
  lines.push(`- Speakers: ${event?.speaker_names.join(', ') || 'none listed'}`);
  if (event?.description_excerpt) {
    lines.push('');
    lines.push('## Description');
    lines.push(event.description_excerpt);
  }
  if (event?.popularity_signals.length) {
    lines.push('');
    lines.push('## Signals');
    for (const signal of event.popularity_signals) {
      lines.push(`- ${signal}`);
    }
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
    const title = response?.title ?? event.canonical_url;
    lines.push(`## ${title}`);
    lines.push(`- URL: ${event.canonical_url}`);
    lines.push(`- Starts: ${response?.starts_at ?? 'unknown'}`);
    lines.push(`- Registration: ${response?.registration_status ?? 'unknown'}`);
    lines.push(`- Price: ${response?.price_type ?? 'unknown'}${response?.price_text ? ` (${response.price_text})` : ''}`);
    lines.push(`- Location: ${formatCompactLocation(response)}`);
    if (response?.description_excerpt) {
      lines.push(`- Description: ${response.description_excerpt}`);
    }
    if (response?.popularity_signals.length) {
      lines.push(`- Signals: ${response.popularity_signals.join('; ')}`);
    }
    lines.push('');
  }

  if (report.events.length === 0) {
    lines.push('No upcoming events found.');
  }

  return lines.join('\n');
}
