import type { RegistrationStatus } from '@luma-agent/shared';

interface Rule {
  status: RegistrationStatus;
  signals: Array<{ label: string; pattern: RegExp }>;
}

const RULES: Rule[] = [
  {
    status: 'closed',
    signals: [
      { label: 'registration closed', pattern: /registration\s+closed/i },
      { label: 'event sold out', pattern: /sold\s*out/i },
      { label: 'tickets unavailable', pattern: /tickets?\s+unavailable/i },
      { label: 'no longer accepting', pattern: /no\s+longer\s+accepting/i },
    ],
  },
  {
    status: 'waitlist',
    signals: [
      { label: 'join waitlist', pattern: /join\s+waitlist/i },
      { label: 'waitlist', pattern: /\bwaitlist\b/i },
    ],
  },
  {
    status: 'approval_required',
    signals: [
      { label: 'request to join', pattern: /request\s+to\s+join/i },
      { label: 'approval required', pattern: /approval\s+required/i },
      { label: 'request access', pattern: /request\s+access/i },
    ],
  },
  {
    status: 'open',
    signals: [
      { label: 'reserve spot', pattern: /reserve\s+(your\s+)?spot/i },
      { label: 'register', pattern: /\bregister\b/i },
      { label: 'rsvp', pattern: /\brsvp\b/i },
      { label: 'get ticket', pattern: /get\s+(a\s+)?ticket/i },
    ],
  },
];

export function classifyRegistrationStatus(pageText: string, ctaTexts: string[]): RegistrationStatus {
  const haystack = `${pageText}\n${ctaTexts.join('\n')}`;

  for (const rule of RULES) {
    if (rule.signals.some((signal) => signal.pattern.test(haystack))) {
      return rule.status;
    }
  }

  return 'unknown';
}
