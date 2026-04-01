import type { LocationType, PriceType } from '../types/index.js';
import { fetchEventPageHtml } from '../retrieval/http-fetch.js';

export interface PageFacts {
  finalUrl: string;
  title?: string;
  startsAt?: string;
  organizerName?: string;
  priceType?: PriceType;
  priceText?: string;
  locationType?: LocationType;
  locationText?: string;
  venueName?: string;
  city?: string;
  descriptionExcerpt?: string;
  popularitySignals: string[];
  pageText: string;
  ctaTexts: string[];
}

export interface ExtractedPageFacts extends Omit<PageFacts, 'finalUrl'> {}

interface EventNode {
  name?: string;
  startDate?: string;
  description?: string;
  organizer?: { name?: string } | Array<{ name?: string }>;
  performer?: { name?: string } | Array<{ name?: string }>;
  location?: unknown;
  offers?: unknown;
  eventAttendanceMode?: string;
  isAccessibleForFree?: boolean;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeText(value: string): string {
  return normalizeWhitespace(stripTags(value));
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim());
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function extractTagTexts(html: string, tagNames: string[]): string[] {
  const tagPattern = tagNames.join('|');
  const regex = new RegExp(`<(${tagPattern})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, 'gi');
  const texts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const text = normalizeText(match[2] ?? '');
    if (text) {
      texts.push(text);
    }
  }
  return texts;
}

function extractMetaContent(html: string, key: string): string | undefined {
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
    'i',
  );
  const match = regex.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() : undefined;
}

function extractJsonLdNodes(html: string): unknown[] {
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const parsed: unknown[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return parsed;
}

function findEventNode(node: unknown): EventNode | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = node as Record<string, unknown>;
  const typeValue = record['@type'];
  if (
    typeValue === 'Event' ||
    (Array.isArray(typeValue) && typeValue.includes('Event'))
  ) {
    return record as unknown as EventNode;
  }

  for (const value of Object.values(record)) {
    const found = findEventNode(value);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function nameFromEntity(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' ? record.name.trim() : undefined;
}

function extractOrganizerName(eventNode: EventNode | undefined): string | undefined {
  if (!eventNode) {
    return undefined;
  }

  if (Array.isArray(eventNode.organizer)) {
    return eventNode.organizer.map((item) => nameFromEntity(item)).find(Boolean);
  }
  if (eventNode.organizer) {
    return nameFromEntity(eventNode.organizer);
  }
  if (Array.isArray(eventNode.performer)) {
    return eventNode.performer.map((item) => nameFromEntity(item)).find(Boolean);
  }
  if (eventNode.performer) {
    return nameFromEntity(eventNode.performer);
  }

  return undefined;
}

function inferLocationType(input: {
  text: string | undefined;
  eventNode: EventNode | undefined;
}): LocationType | undefined {
  const text = input.text?.toLowerCase() ?? '';
  const attendanceMode = input.eventNode?.eventAttendanceMode?.toLowerCase() ?? '';
  if (attendanceMode.includes('mixedeventattendance') || /\bhybrid\b/.test(text)) {
    return 'hybrid';
  }
  if (
    attendanceMode.includes('onlineeventattendance') ||
    /\b(zoom|virtual|online|google meet|webinar|livestream)\b/.test(text)
  ) {
    return 'virtual';
  }
  if (
    attendanceMode.includes('offlineeventattendance') ||
    /\b(in person|location: in person)\b/.test(text)
  ) {
    return 'in_person';
  }
  return undefined;
}

function extractLocationFacts(
  eventNode: EventNode | undefined,
  pageText: string,
): Pick<PageFacts, 'locationType' | 'locationText' | 'venueName' | 'city'> {
  const facts: Pick<PageFacts, 'locationType' | 'locationText' | 'venueName' | 'city'> = {};

  if (eventNode?.location && typeof eventNode.location === 'object') {
    const locationRecord = eventNode.location as Record<string, unknown>;
    const locationName =
      typeof locationRecord.name === 'string' ? locationRecord.name.trim() : undefined;
    const address =
      locationRecord.address && typeof locationRecord.address === 'object'
        ? (locationRecord.address as Record<string, unknown>)
        : undefined;
    const city =
      typeof address?.addressLocality === 'string'
        ? address.addressLocality.trim()
        : undefined;

    if (locationName) {
      facts.venueName = locationName;
    }
    if (city) {
      facts.city = city;
    }
    const locationType = inferLocationType({
      text: [locationName, city].filter(Boolean).join(' '),
      eventNode,
    });
    if (locationType) {
      facts.locationType = locationType;
    }
    const locationText = [locationName, city].filter(Boolean).join(', ');
    if (locationText) {
      facts.locationText = locationText;
    }
  }

  if (!facts.locationType) {
    const locationType = inferLocationType({ text: pageText, eventNode });
    if (locationType) {
      facts.locationType = locationType;
    }
  }

  if (!facts.city) {
    const cityMatch = pageText.match(
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s(?:California|New York|Washington|Texas|Florida|Illinois|Massachusetts|[A-Z]{2})\b/,
    );
    if (cityMatch?.[1]) {
      facts.city = cityMatch[1];
    }
  }

  if (!facts.locationText) {
    const locationMatch = pageText.match(/(?:location|venue):\s*([^\n]+)/i);
    if (locationMatch?.[1]) {
      facts.locationText = locationMatch[1].trim();
    }
  }

  return facts;
}

function extractPriceFacts(
  eventNode: EventNode | undefined,
  pageText: string,
): Pick<PageFacts, 'priceType' | 'priceText'> {
  const text = pageText.toLowerCase();

  if (eventNode?.isAccessibleForFree === true || /\bfree\b/.test(text)) {
    const match = pageText.match(/\bfree\b/i);
    return {
      priceType: 'free',
      priceText: match?.[0] ?? 'Free',
    };
  }

  const offers = eventNode?.offers;
  const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const offer of offerList) {
    if (!offer || typeof offer !== 'object') {
      continue;
    }
    const record = offer as Record<string, unknown>;
    const rawPrice = record.price;
    const priceCurrency =
      typeof record.priceCurrency === 'string' ? record.priceCurrency.trim() : undefined;
    if (typeof rawPrice === 'number' || typeof rawPrice === 'string') {
      const normalized = String(rawPrice).trim();
      if (normalized === '0' || normalized === '0.0' || normalized === '0.00') {
        return {
          priceType: 'free',
          priceText: 'Free',
        };
      }
      return {
        priceType: 'paid',
        priceText: priceCurrency ? `${priceCurrency} ${normalized}` : normalized,
      };
    }
  }

  const paidMatch = pageText.match(/(?:\$|usd\s*)\d[\d,.]*/i);
  if (paidMatch?.[0]) {
    return {
      priceType: 'paid',
      priceText: paidMatch[0],
    };
  }

  return {
    priceType: 'unknown',
  };
}

function extractPopularitySignals(pageText: string): string[] {
  const signals = new Set<string>();
  const patterns = [
    /\b\d{1,3}(?:,\d{3})*\+?\s+(?:attending|attendees|going|people)\b/gi,
    /\bhosted by\s+[^\n]+/gi,
    /\b(waitlist|sold out|registration closed)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = pageText.match(pattern);
    for (const match of matches ?? []) {
      signals.add(match.trim());
    }
  }

  return [...signals].slice(0, 8);
}

export function extractEventPageFactsFromHtml(html: string): ExtractedPageFacts {
  const bodyHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const pageText = normalizeText(bodyHtml);
  const ctaTexts = extractTagTexts(bodyHtml, ['a', 'button']).slice(0, 150);
  const jsonLdNodes = extractJsonLdNodes(html);
  const eventNode = jsonLdNodes.map((node) => findEventNode(node)).find(Boolean);

  const title =
    firstDefined(
      eventNode?.name?.trim(),
      extractTagTexts(bodyHtml, ['h1'])[0],
      extractMetaContent(html, 'og:title'),
      extractMetaContent(html, 'twitter:title'),
      (() => {
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match?.[1] ? normalizeText(match[1]) : undefined;
      })(),
    ) ?? undefined;

  const descriptionExcerpt =
    firstDefined(
      eventNode?.description?.trim(),
      extractMetaContent(html, 'description'),
      extractMetaContent(html, 'og:description'),
      pageText.slice(0, 280),
    ) ?? undefined;

  const organizerName =
    firstDefined(
      extractOrganizerName(eventNode),
      (() => {
        const match = pageText.match(/hosted by\s+([^\n]+)/i);
        return match?.[1]?.trim();
      })(),
    ) ?? undefined;

  const facts: ExtractedPageFacts = {
    popularitySignals: extractPopularitySignals(pageText),
    pageText,
    ctaTexts,
  };

  if (title) {
    facts.title = title;
  }
  const startsAt = parseDate(eventNode?.startDate);
  if (startsAt) {
    facts.startsAt = startsAt;
  }
  if (organizerName) {
    facts.organizerName = organizerName;
  }
  if (descriptionExcerpt) {
    facts.descriptionExcerpt = descriptionExcerpt;
  }

  const locationFacts = extractLocationFacts(eventNode, pageText);
  if (locationFacts.locationType) {
    facts.locationType = locationFacts.locationType;
  }
  if (locationFacts.locationText) {
    facts.locationText = locationFacts.locationText;
  }
  if (locationFacts.venueName) {
    facts.venueName = locationFacts.venueName;
  }
  if (locationFacts.city) {
    facts.city = locationFacts.city;
  }

  const priceFacts = extractPriceFacts(eventNode, pageText);
  if (priceFacts.priceType) {
    facts.priceType = priceFacts.priceType;
  }
  if (priceFacts.priceText) {
    facts.priceText = priceFacts.priceText;
  }

  return facts;
}

export async function fetchEventPageFacts(
  url: string,
  timeoutMs: number,
): Promise<PageFacts> {
  const response = await fetchEventPageHtml(url, timeoutMs);

  return {
    finalUrl: response.finalUrl,
    ...extractEventPageFactsFromHtml(response.html),
  };
}
