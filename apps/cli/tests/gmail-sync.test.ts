import { describe, expect, it } from 'vitest';

import {
  buildIncrementalQuery,
  extractInviteSignals,
  extractLumaUrlsFromMessagePart,
} from '../src/gmail-sync.js';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('gmail sync helpers', () => {
  it('adds an after: constraint when last sync exists', () => {
    const query = buildIncrementalQuery('from:lu.ma', '2026-03-31T20:00:00.000Z');
    expect(query).toContain('from:lu.ma');
    expect(query).toContain('after:');
  });

  it('extracts urls from direct and indirect luma emails and dedupes them', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: {
            data: toBase64Url(
              'Join here https://luma.com/example-event?utm_source=test and again https://lu.ma/example-event',
            ),
          },
        },
        {
          mimeType: 'text/html',
          body: {
            data: toBase64Url(
              '<a href="https://lu.ma/example-event?ref=mail">RSVP</a><a href="https://example.com">Nope</a>',
            ),
          },
        },
      ],
    };

    expect(extractLumaUrlsFromMessagePart(payload)).toEqual(['https://lu.ma/example-event']);
  });

  it('extracts invite signals from the email text', () => {
    const signals = extractInviteSignals({
      subject: "You're invited to Founder Dinner",
      snippet: 'Only 20 seats left.',
      bodyText: 'You have registered for Founder Dinner.',
    });

    expect(signals).toContain("you're invited");
    expect(signals).toContain('registration confirmed');
  });
});
