import type { EventStatus } from '../types/index.js';

export interface StatusSignalsInput {
  pageText: string;
  ctaTexts: string[];
}

export interface ClassificationResult {
  status: EventStatus;
  matchedSignals: string[];
}

interface Rule {
  status: EventStatus;
  signals: { label: string; pattern: RegExp }[];
}

const RULES: Rule[] = [
  {
    status: 'closed',
    signals: [
      { label: 'registration closed', pattern: /registration\s+closed/i },
      { label: 'event sold out', pattern: /sold\s*out/i },
      { label: 'tickets unavailable', pattern: /tickets?\s+unavailable/i },
      { label: 'event ended', pattern: /event\s+ended/i },
      { label: 'no longer accepting', pattern: /no\s+longer\s+accepting/i },
    ],
  },
  {
    status: 'waitlist',
    signals: [
      { label: 'join waitlist', pattern: /join\s+waitlist/i },
      { label: 'waitlist', pattern: /\bwaitlist\b/i },
      { label: 'added to waitlist', pattern: /added\s+to\s+waitlist/i },
    ],
  },
  {
    status: 'approval_required',
    signals: [
      { label: 'request to join', pattern: /request\s+to\s+join/i },
      { label: 'approval required', pattern: /approval\s+required/i },
      { label: 'request access', pattern: /request\s+access/i },
      { label: 'awaiting approval', pattern: /awaiting\s+approval/i },
    ],
  },
  {
    status: 'open',
    signals: [
      { label: 'reserve spot', pattern: /reserve\s+(your\s+)?spot/i },
      { label: 'register', pattern: /\bregister\b/i },
      { label: 'rsvp', pattern: /\brsvp\b/i },
      { label: 'get ticket', pattern: /get\s+(a\s+)?ticket/i },
      { label: 'book now', pattern: /book\s+now/i },
    ],
  },
];

function flattenSignalText(input: StatusSignalsInput): string {
  const ctas = input.ctaTexts.join('\n');
  return `${input.pageText}\n${ctas}`;
}

export function classifyStatus(input: StatusSignalsInput): ClassificationResult {
  const haystack = flattenSignalText(input);

  for (const rule of RULES) {
    const matchedSignals = rule.signals
      .filter((signal) => signal.pattern.test(haystack))
      .map((signal) => signal.label);

    if (matchedSignals.length > 0) {
      return {
        status: rule.status,
        matchedSignals,
      };
    }
  }

  return {
    status: 'unknown',
    matchedSignals: [],
  };
}
