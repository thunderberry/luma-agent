export type EventStatus =
  | 'open'
  | 'approval_required'
  | 'waitlist'
  | 'closed'
  | 'unknown';

export interface InviteLink {
  messageId: string;
  threadId?: string;
  receivedAt: string;
  subject?: string;
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
  error?: string;
}

export interface DailySummary {
  runDate: string;
  generatedAt: string;
  timezone: string;
  counts: Record<EventStatus | 'total' | 'errors', number>;
  events: EventCheckResult[];
}
