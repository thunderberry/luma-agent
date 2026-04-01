export type EventStatus =
  | 'open'
  | 'approval_required'
  | 'waitlist'
  | 'closed'
  | 'unknown';

export type PriceType = 'free' | 'paid' | 'unknown';

export type LocationType = 'in_person' | 'virtual' | 'hybrid' | 'unknown';

export interface EmailFacts {
  sender?: string;
  snippet?: string;
  titleHint?: string;
  organizerHint?: string;
  startsAt?: string;
  locationType?: LocationType;
  locationText?: string;
  venueName?: string;
  city?: string;
  inviteSignals: string[];
}

export interface InviteLink {
  messageId: string;
  threadId?: string;
  receivedAt: string;
  subject?: string;
  sender?: string;
  snippet?: string;
  emailFacts?: EmailFacts;
  rawUrl: string;
  canonicalUrl: string;
}

export interface EventCheckResult {
  canonicalUrl: string;
  sourceUrl: string;
  finalUrl?: string;
  title?: string;
  startsAt?: string;
  status: EventStatus;
  matchedSignals: string[];
  checkedAt: string;
  organizerName?: string;
  priceType?: PriceType;
  priceText?: string;
  locationType?: LocationType;
  locationText?: string;
  venueName?: string;
  city?: string;
  descriptionExcerpt?: string;
  popularitySignals?: string[];
  emailFacts?: EmailFacts;
  error?: string;
}

export interface DailySummary {
  runDate: string;
  generatedAt: string;
  timezone: string;
  counts: Record<EventStatus | 'total' | 'errors', number>;
  events: EventCheckResult[];
}
