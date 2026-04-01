import type { LocationType, PriceType } from '@luma-agent/shared';
import {
  decodeHtmlEntities,
  limitText,
  normalizeText,
  normalizeWhitespace,
} from '@luma-agent/shared';

export interface ExtractedEventPageFacts {
  title?: string;
  starts_at?: string;
  city?: string;
  venue?: string;
  location_type: LocationType;
  price_type: PriceType;
  price_text?: string;
  organizer_names: string[];
  speaker_names: string[];
  description_excerpt?: string;
  popularity_signals: string[];
  page_text: string;
  cta_texts: string[];
}

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
  if (typeValue === 'Event' || (Array.isArray(typeValue) && typeValue.includes('Event'))) {
    return record as EventNode;
  }

  for (const value of Object.values(record)) {
    const found = findEventNode(value);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function namesFromEntity(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return [];
      }
      const name = (candidate as Record<string, unknown>).name;
      return typeof name === 'string' && name.trim() ? [name.trim()] : [];
    });
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

function inferLocationType(text: string | undefined, eventNode: EventNode | undefined): LocationType {
  const normalizedText = text?.toLowerCase() ?? '';
  const attendanceMode = eventNode?.eventAttendanceMode?.toLowerCase() ?? '';
  if (attendanceMode.includes('mixedeventattendance') || /\bhybrid\b/.test(normalizedText)) {
    return 'hybrid';
  }
  if (
    attendanceMode.includes('onlineeventattendance')
    || /\b(zoom|virtual|online|google meet|webinar|livestream)\b/.test(normalizedText)
  ) {
    return 'virtual';
  }
  if (
    attendanceMode.includes('offlineeventattendance')
    || /\b(in person|location: in person)\b/.test(normalizedText)
  ) {
    return 'in_person';
  }
  return 'unknown';
}

function extractLocationFacts(
  eventNode: EventNode | undefined,
  pageText: string,
): Pick<ExtractedEventPageFacts, 'location_type' | 'city' | 'venue'> {
  const facts: Pick<ExtractedEventPageFacts, 'location_type' | 'city' | 'venue'> = {
    location_type: inferLocationType(pageText, eventNode),
  };

  if (eventNode?.location && typeof eventNode.location === 'object') {
    const locationRecord = eventNode.location as Record<string, unknown>;
    const venue =
      typeof locationRecord.name === 'string' ? locationRecord.name.trim() : undefined;
    const address =
      locationRecord.address && typeof locationRecord.address === 'object'
        ? (locationRecord.address as Record<string, unknown>)
        : undefined;
    const city =
      typeof address?.addressLocality === 'string'
        ? address.addressLocality.trim()
        : undefined;

    if (venue) {
      facts.venue = venue;
    }
    if (city) {
      facts.city = city;
    }
    const locationText = [venue, city].filter(Boolean).join(', ');
    if (locationText) {
      facts.location_type = inferLocationType(locationText, eventNode);
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

  return facts;
}

function extractPriceFacts(
  eventNode: EventNode | undefined,
  pageText: string,
): Pick<ExtractedEventPageFacts, 'price_type' | 'price_text'> {
  const text = pageText.toLowerCase();

  if (eventNode?.isAccessibleForFree === true || /\bfree\b/.test(text)) {
    return {
      price_type: 'free',
      price_text: 'Free',
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
          price_type: 'free',
          price_text: 'Free',
        };
      }
      return {
        price_type: 'paid',
        price_text: priceCurrency ? `${priceCurrency} ${normalized}` : normalized,
      };
    }
  }

  const paidMatch = pageText.match(/(?:\$|usd\s*)\d[\d,.]*/i);
  if (paidMatch?.[0]) {
    return {
      price_type: 'paid',
      price_text: paidMatch[0],
    };
  }

  return {
    price_type: 'unknown',
  };
}

function extractPopularitySignals(pageText: string): string[] {
  const signals = new Set<string>();
  const patterns = [
    /\b\d{1,3}(?:,\d{3})*\+?\s+(?:attending|attendees|going|people)\b/gi,
    /\b\d+\s+spots?\s+left\b/gi,
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

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim());
}

export function extractEventPageFactsFromHtml(html: string): ExtractedEventPageFacts {
  const bodyHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const pageText = normalizeText(bodyHtml);
  const ctaTexts = extractTagTexts(bodyHtml, ['a', 'button']).slice(0, 150);
  const jsonLdNodes = extractJsonLdNodes(html);
  const eventNode = jsonLdNodes.map((node) => findEventNode(node)).find(Boolean);

  const title = firstDefined(
    eventNode?.name?.trim(),
    extractTagTexts(bodyHtml, ['h1'])[0],
    extractMetaContent(html, 'og:title'),
    extractMetaContent(html, 'twitter:title'),
    (() => {
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return match?.[1] ? normalizeText(match[1]) : undefined;
    })(),
  );

  const descriptionExcerpt = limitText(
    firstDefined(
      eventNode?.description?.trim(),
      extractMetaContent(html, 'description'),
      extractMetaContent(html, 'og:description'),
      pageText.slice(0, 280),
    ),
  );

  const organizerNames = [
    ...namesFromEntity(eventNode?.organizer),
    ...pageText.match(/hosted by\s+([^\n]+)/i)?.slice(1, 2).map((value) => normalizeWhitespace(value)) ?? [],
  ].filter(Boolean);

  const speakerNames = namesFromEntity(eventNode?.performer);

  const locationFacts = extractLocationFacts(eventNode, pageText);
  const priceFacts = extractPriceFacts(eventNode, pageText);

  const startsAt = parseDate(eventNode?.startDate);

  return {
    ...(title ? { title } : {}),
    ...(startsAt ? { starts_at: startsAt } : {}),
    ...(locationFacts.city ? { city: locationFacts.city } : {}),
    ...(locationFacts.venue ? { venue: locationFacts.venue } : {}),
    location_type: locationFacts.location_type,
    price_type: priceFacts.price_type,
    ...(priceFacts.price_text ? { price_text: priceFacts.price_text } : {}),
    organizer_names: [...new Set(organizerNames)],
    speaker_names: [...new Set(speakerNames)],
    ...(descriptionExcerpt ? { description_excerpt: descriptionExcerpt } : {}),
    popularity_signals: extractPopularitySignals(pageText),
    page_text: pageText,
    cta_texts: ctaTexts,
  };
}
