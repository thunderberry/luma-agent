import { describe, expect, it } from 'vitest';

import {
  canonicalizeInviteUrl,
  dedupeInvites,
  extractLumaUrlsFromMessagePart,
} from '../../src/gmail/link-parser.js';
import type { InviteLink } from '../../src/types/index.js';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('link parser', () => {
  it('extracts lu.ma links from text and html payloads', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: {
            data: toBase64Url(
              'Join here https://lu.ma/abc123?utm_source=test and ignore https://example.com/skip',
            ),
          },
        },
        {
          mimeType: 'text/html',
          body: {
            data: toBase64Url(
              '<a href="https://www.lu.ma/def456?ref=mail">RSVP</a><a href="https://google.com">No</a>',
            ),
          },
        },
      ],
    };

    const urls = extractLumaUrlsFromMessagePart(payload);

    expect(urls).toHaveLength(2);
    expect(urls.some((url) => url.includes('lu.ma/abc123'))).toBe(true);
    expect(urls.some((url) => url.includes('lu.ma/def456'))).toBe(true);
  });

  it('canonicalizes luma urls and strips query/hash', () => {
    expect(canonicalizeInviteUrl('https://www.lu.ma/my-event/?utm_source=x#fragment')).toBe(
      'https://lu.ma/my-event',
    );
    expect(canonicalizeInviteUrl('https://lu.ma/my-event?invite=abc')).toBe(
      'https://lu.ma/my-event',
    );
    expect(canonicalizeInviteUrl('https://example.com/not-luma')).toBeNull();
  });

  it('dedupes by canonical url and keeps most recent invite', () => {
    const invites: InviteLink[] = [
      {
        messageId: '1',
        receivedAt: '2026-03-30T00:00:00.000Z',
        rawUrl: 'https://lu.ma/e/abc?token=old',
        canonicalUrl: 'https://lu.ma/e/abc',
      },
      {
        messageId: '2',
        receivedAt: '2026-03-31T00:00:00.000Z',
        rawUrl: 'https://lu.ma/e/abc?token=new',
        canonicalUrl: 'https://lu.ma/e/abc',
      },
    ];

    const deduped = dedupeInvites(invites);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.messageId).toBe('2');
  });
});
