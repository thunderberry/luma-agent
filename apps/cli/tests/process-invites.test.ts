import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { FetchLumaEventResponse } from '@luma-agent/shared';

import type { CliConfig } from '../src/config.js';
import { processInvites } from '../src/process-invites.js';

function testConfig(repoRoot: string): CliConfig {
  const runtimeRoot = path.join(repoRoot, '.runtime');
  const stateDir = path.join(runtimeRoot, 'state');
  const outputDir = path.join(runtimeRoot, 'output');

  return {
    repoRoot,
    helperBaseUrl: 'https://example-helper.vercel.app',
    helperBearerToken: 'secret',
    helperClientId: 'codex-agent',
    runtimeRoot,
    stateDir,
    outputDir,
    latestInvitesPath: path.join(stateDir, 'latest-invites.json'),
    messageStatePath: path.join(stateDir, 'message-state.json'),
    eventCachePath: path.join(stateDir, 'event-cache.json'),
    lastRunPath: path.join(stateDir, 'last-run.json'),
    latestFactsPath: path.join(outputDir, 'latest.json'),
    latestMarkdownPath: path.join(outputDir, 'latest.md'),
  };
}

function helperFact(url: string, title: string): FetchLumaEventResponse {
  return {
    url,
    title,
    host_names: [],
    category_names: [],
    page_fetch_status: 'ok',
    last_verified_at: '2026-04-01T00:00:00.000Z',
    content_hash: `hash-${title}`,
  };
}

describe('process invites', () => {
  it('persists latest invite state, tracks newness, and builds a durable event cache', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-cli-'));
    const config = testConfig(repoRoot);
    const inputPath = path.join(repoRoot, 'invites.json');

    writeFileSync(
      inputPath,
      JSON.stringify({
        invites: [
          {
            messageId: 'msg-1',
            receivedAt: '2026-04-01T08:00:00.000Z',
            rawUrl: 'https://lu.ma/event-one?utm_source=gmail',
          },
          {
            messageId: 'msg-2',
            receivedAt: '2026-04-01T09:00:00.000Z',
            rawUrl: 'https://luma.com/event-two',
          },
          {
            messageId: 'msg-3',
            receivedAt: '2026-04-01T10:00:00.000Z',
            rawUrl: 'https://lu.ma/event-one',
          },
        ],
      }, null, 2),
      'utf8',
    );

    const oldMarkdownPath = config.latestMarkdownPath;
    mkdirSync(path.dirname(oldMarkdownPath), { recursive: true });
    writeFileSync(oldMarkdownPath, 'stale markdown', 'utf8');

    const processedUrls: string[][] = [];
    const result = await processInvites(config, inputPath, async (_cfg, urls) => {
      processedUrls.push(urls);
      return urls.map((url, index) => helperFact(url, `Event ${index + 1}`));
    });

    expect(result.new_message_count).toBe(3);
    expect(result.new_event_count).toBe(2);
    expect(result.fetched_this_run_count).toBe(2);
    expect(result.cached_event_count).toBe(2);
    expect(result.helper_facts_count).toBe(2);
    expect(processedUrls).toEqual([['https://lu.ma/event-one', 'https://lu.ma/event-two']]);

    const latestInvites = JSON.parse(readFileSync(config.latestInvitesPath, 'utf8'));
    expect(latestInvites.new_message_ids).toEqual(['msg-1', 'msg-2', 'msg-3']);
    expect(latestInvites.new_event_urls).toEqual(['https://lu.ma/event-one', 'https://lu.ma/event-two']);
    expect(latestInvites.invites[0].is_new_message).toBe(true);
    expect(latestInvites.invites[0].is_new_event_url).toBe(true);
    expect(latestInvites.invites[2].is_new_event_url).toBe(false);

    const latestFacts = JSON.parse(readFileSync(config.latestFactsPath, 'utf8'));
    expect(latestFacts).toHaveLength(2);
    expect(latestFacts[0].url).toBe('https://lu.ma/event-one');

    const cache = JSON.parse(readFileSync(config.eventCachePath, 'utf8'));
    expect(cache).toHaveLength(2);
    expect(cache[0].canonical_url).toBe('https://lu.ma/event-one');
    expect(cache[0].helper_response.url).toBe('https://lu.ma/event-one');

    expect(readFileSync(oldMarkdownPath, 'utf8')).toBe('stale markdown');
  });

  it('skips previously processed messages, fetches only missing urls, and keeps full helper snapshot', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-cli-'));
    const config = testConfig(repoRoot);
    const inputPath = path.join(repoRoot, 'invites.json');

    mkdirSync(path.dirname(config.messageStatePath), { recursive: true });
    writeFileSync(
      config.messageStatePath,
      JSON.stringify({
        last_successful_run_at: '2026-04-01T00:00:00.000Z',
        processed_message_ids: ['msg-1'],
        processed_event_urls: ['https://lu.ma/event-one'],
      }, null, 2),
      'utf8',
    );
    writeFileSync(
      config.eventCachePath,
      JSON.stringify([
        {
          canonical_url: 'https://lu.ma/event-one',
          source_message_ids: ['msg-1'],
          first_seen_at: '2026-04-01T08:00:00.000Z',
          last_seen_at: '2026-04-01T08:00:00.000Z',
          last_fetched_at: '2026-04-01T08:05:00.000Z',
          helper_response: helperFact('https://lu.ma/event-one', 'Cached Event'),
        },
      ], null, 2),
      'utf8',
    );

    writeFileSync(
      inputPath,
      JSON.stringify({
        invites: [
          {
            messageId: 'msg-1',
            receivedAt: '2026-04-01T08:00:00.000Z',
            rawUrl: 'https://lu.ma/event-one',
          },
          {
            messageId: 'msg-2',
            receivedAt: '2026-04-01T09:00:00.000Z',
            rawUrl: 'https://lu.ma/event-two',
          },
        ],
      }, null, 2),
      'utf8',
    );

    const processedUrls: string[][] = [];
    const result = await processInvites(config, inputPath, async (_cfg, urls) => {
      processedUrls.push(urls);
      return urls.map((url) => helperFact(url, 'Fresh Event'));
    });

    expect(result.new_message_count).toBe(1);
    expect(result.repeated_message_count).toBe(1);
    expect(result.new_event_count).toBe(1);
    expect(result.fetched_this_run_count).toBe(1);
    expect(processedUrls).toEqual([['https://lu.ma/event-two']]);

    const latestInvites = JSON.parse(readFileSync(config.latestInvitesPath, 'utf8'));
    expect(latestInvites.repeated_message_ids).toEqual(['msg-1']);
    expect(latestInvites.new_event_urls).toEqual(['https://lu.ma/event-two']);

    const latestFacts = JSON.parse(readFileSync(config.latestFactsPath, 'utf8'));
    expect(latestFacts).toHaveLength(2);
    expect(latestFacts[0].url).toBe('https://lu.ma/event-one');
    expect(latestFacts[1].url).toBe('https://lu.ma/event-two');

    const cache = JSON.parse(readFileSync(config.eventCachePath, 'utf8'));
    expect(cache).toHaveLength(2);
    expect(cache[0].canonical_url).toBe('https://lu.ma/event-one');
    expect(cache[1].canonical_url).toBe('https://lu.ma/event-two');
  });
});
