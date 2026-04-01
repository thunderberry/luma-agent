import { describe, expect, it } from 'vitest';

import { shouldRefreshCachedEvent, type CachedEventRecord } from '@luma-agent/shared';

describe('event refresh policy', () => {
  it('refreshes new events without cached helper data', () => {
    expect(shouldRefreshCachedEvent(undefined)).toBe(true);
  });

  it('refreshes stale upcoming events', () => {
    const record: CachedEventRecord = {
      canonical_url: 'https://lu.ma/test',
      url_hash: 'abc',
      source_message_ids: ['1'],
      helper_response: {
        title: 'Soon',
        start_at: '2026-04-02T20:00:00.000Z',
        host_names: [],
        category_names: [],
        page_fetch_status: 'ok',
        last_verified_at: '2026-03-25T20:00:00.000Z',
        content_hash: 'hash',
      },
      first_seen_at: '2026-03-25T20:00:00.000Z',
      last_seen_at: '2026-03-25T20:00:00.000Z',
      last_fetched_at: '2026-03-25T20:00:00.000Z',
    };

    expect(shouldRefreshCachedEvent(record, new Date('2026-03-31T20:00:00.000Z'))).toBe(true);
  });

  it('skips past events', () => {
    const record: CachedEventRecord = {
      canonical_url: 'https://lu.ma/test',
      url_hash: 'abc',
      source_message_ids: ['1'],
      helper_response: {
        title: 'Past',
        start_at: '2026-03-01T20:00:00.000Z',
        host_names: [],
        category_names: [],
        page_fetch_status: 'ok',
        last_verified_at: '2026-03-02T20:00:00.000Z',
        content_hash: 'hash',
      },
      first_seen_at: '2026-03-01T20:00:00.000Z',
      last_seen_at: '2026-03-02T20:00:00.000Z',
      last_fetched_at: '2026-03-02T20:00:00.000Z',
    };

    expect(shouldRefreshCachedEvent(record, new Date('2026-03-31T20:00:00.000Z'))).toBe(false);
  });
});
