import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CachedEventRecord, CachedMessageRecord } from '@luma-agent/shared';

import { loadConfig } from '../src/config.js';
import { renderContentArtifacts, writeUpcomingReport } from '../src/reports.js';

describe('artifact and report rendering', () => {
  it('writes event json/markdown and only includes upcoming events in the daily report', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-cli-'));
    const previousCwd = process.cwd();
    process.chdir(repoRoot);

    try {
      const config = loadConfig({
        ...process.env,
        LUMA_CONTENT_DIR: path.join(repoRoot, 'content'),
        LUMA_CACHE_DIR: path.join(repoRoot, '.runtime', 'cache'),
      }, repoRoot);

      const messages: CachedMessageRecord[] = [
        {
          message_id: 'm1',
          received_at: '2026-03-31T20:00:00.000Z',
          extracted_urls: ['https://lu.ma/future'],
          invite_signals: ["you're invited"],
          processed_at: '2026-03-31T20:00:00.000Z',
        },
      ];
      const events: CachedEventRecord[] = [
        {
          canonical_url: 'https://lu.ma/future',
          url_hash: 'future',
          source_message_ids: ['m1'],
          helper_response: {
            title: 'Future Event',
            start_at: '2026-04-05T18:00:00.000Z',
            city: 'San Francisco',
            host_names: ['Founders Bay'],
            category_names: [],
            page_fetch_status: 'ok',
            last_verified_at: '2026-03-31T20:00:00.000Z',
            content_hash: 'hash1',
          },
          first_seen_at: '2026-03-31T20:00:00.000Z',
          last_seen_at: '2026-03-31T20:00:00.000Z',
          last_fetched_at: '2026-03-31T20:00:00.000Z',
        },
        {
          canonical_url: 'https://lu.ma/past',
          url_hash: 'past',
          source_message_ids: [],
          helper_response: {
            title: 'Past Event',
            start_at: '2026-03-01T18:00:00.000Z',
            city: 'San Jose',
            host_names: ['Founders Bay'],
            category_names: [],
            page_fetch_status: 'ok',
            last_verified_at: '2026-03-01T20:00:00.000Z',
            content_hash: 'hash2',
          },
          first_seen_at: '2026-03-01T20:00:00.000Z',
          last_seen_at: '2026-03-01T20:00:00.000Z',
          last_fetched_at: '2026-03-01T20:00:00.000Z',
        },
      ];

      await renderContentArtifacts(config, events, messages);
      const report = await writeUpcomingReport(config, events, messages);

      expect(report.events).toHaveLength(1);
      expect(report.events[0]?.canonical_url).toBe('https://lu.ma/future');
      expect(readFileSync(path.join(config.contentEventsDir, 'future-event.json'), 'utf8')).toContain('Future Event');
      expect(readFileSync(path.join(config.contentEventsDir, 'future-event.md'), 'utf8')).toContain('# Future Event');
      expect(readFileSync(path.join(config.contentReportsDir, `${report.run_date}.json`), 'utf8')).toContain('Future Event');
    } finally {
      process.chdir(previousCwd);
    }
  });
});
