import { describe, expect, it } from 'vitest';

import { extractEmailFacts } from '../../src/gmail/email-facts.js';

describe('email facts extraction', () => {
  it('extracts invite title, organizer, startsAt, and location hints', () => {
    const facts = extractEmailFacts({
      bodyText: [
        "You're invited to",
        'Total Agent Recall Hackathon',
        'Saturday, March 28 10:00 AM - 6:00 PM PDT',
        'Location: In Person',
        'Fort Mason Center, San Francisco, CA',
      ].join('\n'),
      subject: 'You are invited to Total Agent Recall Hackathon',
      sender: 'GMI Cloud <gmicloud@calendar.luma-mail.com>',
      snippet: 'Only 50 serious technical builders in SF will be in the room.',
      receivedAt: '2026-03-24T22:14:54.000Z',
    });

    expect(facts.titleHint).toBe('Total Agent Recall Hackathon');
    expect(facts.organizerHint).toContain('GMI Cloud');
    expect(facts.startsAt).toContain('2026-03-28');
    expect(facts.locationType).toBe('in_person');
    expect(facts.city).toBe('San Francisco');
    expect(facts.inviteSignals).toContain("you're invited");
  });
});
