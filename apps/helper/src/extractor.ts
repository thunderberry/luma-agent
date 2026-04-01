import type { z } from 'zod';

import { FetchLumaEventResponseSchema } from './contract.js';
import { normalizeWhitespace } from './shared-utils.js';

type ExtractedStructuredFacts = Pick<
  z.infer<typeof FetchLumaEventResponseSchema>,
  | 'title'
  | 'start_at'
  | 'end_at'
  | 'url'
  | 'city'
  | 'host_names'
  | 'waitlist'
  | 'ticket_price'
  | 'sold_out'
  | 'has_available_ticket_types'
  | 'category_names'
  | 'calendar_name'
  | 'calendar_description_short'
  | 'description'
>;

function parseNextDataPayload(html: string): unknown {
  const match = html.match(
    /<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const nextData = JSON.parse(match[1]);
    return nextData?.props?.pageProps?.initialData?.data;
  } catch {
    return undefined;
  }
}

function plainTextFromDescriptionNode(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  if (Array.isArray(node)) {
    return node.map((item) => plainTextFromDescriptionNode(item)).filter(Boolean).join('\n');
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === 'string') {
    return record.text;
  }

  const content = Array.isArray(record.content) ? record.content : [];
  const inner = content.map((item) => plainTextFromDescriptionNode(item)).filter(Boolean).join('');
  if (!inner) {
    return '';
  }

  if (record.type === 'paragraph' || record.type === 'blockquote' || record.type === 'heading') {
    return `${inner}\n\n`;
  }

  if (record.type === 'hard_break') {
    return '\n';
  }

  return inner;
}

function extractDescription(value: unknown): string | undefined {
  const text = normalizeWhitespace(plainTextFromDescriptionNode(value));
  return text || undefined;
}

function formatTicketPrice(payload: Record<string, unknown>): string | null | undefined {
  const ticketTypes = Array.isArray(payload.ticket_types) ? payload.ticket_types : [];
  for (const ticketType of ticketTypes) {
    if (!ticketType || typeof ticketType !== 'object') {
      continue;
    }

    const record = ticketType as Record<string, unknown>;
    if (record.type === 'free') {
      return 'free';
    }

    const cents = typeof record.cents === 'number' ? record.cents : null;
    const currency = typeof record.currency === 'string' ? record.currency : null;
    if (cents !== null) {
      const amount = (cents / 100).toFixed(2).replace(/\.00$/, '');
      return currency === 'USD' || currency === null ? `$${amount}` : `${currency} ${amount}`;
    }
  }

  const ticketInfo =
    payload.ticket_info && typeof payload.ticket_info === 'object'
      ? (payload.ticket_info as Record<string, unknown>)
      : undefined;
  if (!ticketInfo) {
    return undefined;
  }

  if (ticketInfo.is_free === true) {
    return 'free';
  }

  const price = ticketInfo.price;
  if (typeof price === 'string' || typeof price === 'number') {
    return String(price);
  }

  const maxPrice = ticketInfo.max_price;
  if (typeof maxPrice === 'string' || typeof maxPrice === 'number') {
    return String(maxPrice);
  }

  return null;
}

function extractWaitlist(payload: Record<string, unknown>): string | null | undefined {
  const event =
    payload.event && typeof payload.event === 'object'
      ? (payload.event as Record<string, unknown>)
      : undefined;

  const waitlistStatus = typeof event?.waitlist_status === 'string' ? event.waitlist_status : undefined;
  if (waitlistStatus) {
    return waitlistStatus;
  }

  if (payload.waitlist_active === true) {
    return 'active';
  }

  if (event?.waitlist_enabled === true) {
    return 'enabled';
  }

  return null;
}

function extractEventUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return `https://lu.ma/${trimmed.replace(/^\/+/, '')}`;
  }
}

export function extractStructuredPageDataFromHtml(html: string): ExtractedStructuredFacts | undefined {
  const payload = parseNextDataPayload(html);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const event =
    record.event && typeof record.event === 'object'
      ? (record.event as Record<string, unknown>)
      : undefined;
  const geoAddressInfo =
    event?.geo_address_info && typeof event.geo_address_info === 'object'
      ? (event.geo_address_info as Record<string, unknown>)
      : undefined;
  const calendar =
    record.calendar && typeof record.calendar === 'object'
      ? (record.calendar as Record<string, unknown>)
      : undefined;
  const hosts = Array.isArray(record.hosts) ? record.hosts : [];
  const categories = Array.isArray(record.categories) ? record.categories : [];

  const extracted: ExtractedStructuredFacts = {
    host_names: hosts.flatMap((host) => {
      if (!host || typeof host !== 'object') {
        return [];
      }
      const name = (host as Record<string, unknown>).name;
      return typeof name === 'string' && name.trim() ? [name.trim()] : [];
    }),
    category_names: categories.flatMap((category) => {
      if (!category || typeof category !== 'object') {
        return [];
      }
      const name = (category as Record<string, unknown>).name;
      return typeof name === 'string' && name.trim() ? [name.trim()] : [];
    }),
  };

  if (typeof event?.name === 'string' && event.name.trim()) {
    extracted.title = event.name.trim();
  }
  if (typeof event?.start_at === 'string' && event.start_at.trim()) {
    extracted.start_at = event.start_at.trim();
  }
  if (typeof event?.end_at === 'string' && event.end_at.trim()) {
    extracted.end_at = event.end_at.trim();
  }
  const eventUrl = extractEventUrl(event?.url);
  if (eventUrl) {
    extracted.url = eventUrl;
  }
  if (typeof geoAddressInfo?.city === 'string' && geoAddressInfo.city.trim()) {
    extracted.city = geoAddressInfo.city.trim();
  }
  const waitlist = extractWaitlist(record);
  if (waitlist !== undefined) {
    extracted.waitlist = waitlist;
  }
  const ticketPrice = formatTicketPrice(record);
  if (ticketPrice !== undefined) {
    extracted.ticket_price = ticketPrice;
  }
  if (typeof record.sold_out === 'boolean') {
    extracted.sold_out = record.sold_out;
  }
  if (typeof record.has_available_ticket_types === 'boolean') {
    extracted.has_available_ticket_types = record.has_available_ticket_types;
  }
  if (typeof calendar?.name === 'string' && calendar.name.trim()) {
    extracted.calendar_name = calendar.name.trim();
  }
  if (
    typeof calendar?.description_short === 'string'
    && calendar.description_short.trim()
  ) {
    extracted.calendar_description_short = calendar.description_short.trim();
  }
  const description = extractDescription(record.description_mirror);
  if (description) {
    extracted.description = description;
  }

  return extracted;
}
