import type { EmailFacts, LocationType } from '../types/index.js';

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function cleanLine(line: string): string {
  return normalizeWhitespace(line.replace(/\u00a0/g, ' '));
}

function parseStartsAt(line: string, receivedAt: string): string | undefined {
  const normalized = cleanLine(line);
  if (!normalized) {
    return undefined;
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const startSegment = normalized.split(/\s+-\s+/)[0]?.trim();
  if (!startSegment) {
    return undefined;
  }

  const year = new Date(receivedAt).getUTCFullYear();
  const withYear = new Date(`${startSegment}, ${year}`);
  if (!Number.isNaN(withYear.getTime())) {
    return withYear.toISOString();
  }

  return undefined;
}

function inferLocationType(line: string | undefined): LocationType | undefined {
  if (!line) {
    return undefined;
  }

  const normalized = cleanLine(line).toLowerCase();
  if (/\b(zoom|virtual|online|google meet|meet\.google|teams|webinar)\b/.test(normalized)) {
    return 'virtual';
  }
  if (/\bhybrid\b/.test(normalized)) {
    return 'hybrid';
  }
  if (/\b(in person|location: in person)\b/.test(normalized)) {
    return 'in_person';
  }
  return undefined;
}

function inferCity(line: string | undefined): string | undefined {
  if (!line) {
    return undefined;
  }

  const parts = cleanLine(line)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (candidate && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function maybeTitleLine(line: string): boolean {
  if (!line) {
    return false;
  }

  return !/^(accept invite|view event|my ticket|event page|location:|sent using|you received this email)/i.test(
    line,
  );
}

export function extractEmailFacts(input: {
  bodyText: string;
  subject: string | undefined;
  sender: string | undefined;
  snippet: string | undefined;
  receivedAt: string;
}): EmailFacts {
  const lines = input.bodyText
    .split('\n')
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const inviteSignals: string[] = [];
  const haystack = [input.subject, input.snippet, input.bodyText].filter(Boolean).join('\n');
  if (/you(?:'|’)re invited to/i.test(haystack)) {
    inviteSignals.push("you're invited");
  }
  if (/you have registered for/i.test(haystack)) {
    inviteSignals.push('registration confirmed');
  }
  if (/you(?:'|’)ve got a spot at/i.test(haystack)) {
    inviteSignals.push('approved');
  }
  if (/thanks for joining/i.test(haystack)) {
    inviteSignals.push('post-event followup');
  }

  let titleHint: string | undefined;
  let startsAt: string | undefined;
  let locationText: string | undefined;
  let locationType: LocationType | undefined;
  let venueName: string | undefined;
  let city: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;

    if (!titleHint && /you(?:'|’)re invited to|you have registered for|you(?:'|’)ve got a spot at/i.test(line)) {
      const candidate = lines[index + 1];
      if (candidate && maybeTitleLine(candidate)) {
        titleHint = candidate;
      }
      continue;
    }

    if (!startsAt && /(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+[a-z]{3,}/i.test(line)) {
      startsAt = parseStartsAt(line, input.receivedAt);
      continue;
    }

    if (!locationText && /^location:/i.test(line)) {
      locationText = line.replace(/^location:\s*/i, '').trim();
      locationType = inferLocationType(locationText);
      city = inferCity(locationText);
      if (locationType === 'in_person' && lines[index + 1] && !/^https?:\/\//i.test(lines[index + 1] as string)) {
        venueName = lines[index + 1];
        city ??= inferCity(venueName);
      }
    }
  }

  const organizerHint = input.sender?.split('<')[0]?.replace(/["<>]/g, '').trim() || undefined;

  const facts: EmailFacts = {
    inviteSignals,
  };

  if (input.sender) {
    facts.sender = input.sender;
  }
  if (input.snippet) {
    facts.snippet = input.snippet;
  }
  if (titleHint) {
    facts.titleHint = titleHint;
  }
  if (organizerHint) {
    facts.organizerHint = organizerHint;
  }
  if (startsAt) {
    facts.startsAt = startsAt;
  }
  if (locationType) {
    facts.locationType = locationType;
  }
  if (locationText) {
    facts.locationText = locationText;
  }
  if (venueName) {
    facts.venueName = venueName;
  }
  if (city) {
    facts.city = city;
  }

  return facts;
}
