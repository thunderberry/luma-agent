import path from 'node:path';

import {
  computeNextRefreshAt,
  type CachedEventRecord,
  type CachedMessageRecord,
  isoNow,
  shouldRefreshCachedEvent,
  urlHash,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';
import { ensureDir, listJsonFiles, readJsonFile, readJsonFileIfExists, writeJsonAtomic } from './fs.js';
import { fetchHelperEvent } from './helper-client.js';

function eventCachePath(config: CliConfig, canonicalUrl: string): string {
  return path.join(config.eventCacheDir, `${urlHash(canonicalUrl)}.json`);
}

function refreshStatePath(config: CliConfig): string {
  return path.join(config.stateDir, 'last-event-refresh.json');
}

export async function loadCachedMessages(config: CliConfig): Promise<CachedMessageRecord[]> {
  const files = await listJsonFiles(config.messageCacheDir);
  return Promise.all(files.map((file) => readJsonFile<CachedMessageRecord>(file)));
}

export async function loadCachedEvents(config: CliConfig): Promise<CachedEventRecord[]> {
  const files = await listJsonFiles(config.eventCacheDir);
  return Promise.all(files.map((file) => readJsonFile<CachedEventRecord>(file)));
}

function collectEventSources(messages: CachedMessageRecord[]): Map<string, CachedMessageRecord[]> {
  const sources = new Map<string, CachedMessageRecord[]>();
  for (const message of messages) {
    for (const url of message.extracted_urls) {
      const bucket = sources.get(url) ?? [];
      bucket.push(message);
      sources.set(url, bucket);
    }
  }
  return sources;
}

export async function refreshEvents(
  config: CliConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CachedEventRecord[]> {
  await ensureDir(config.eventCacheDir);
  await ensureDir(config.stateDir);

  const messages = await loadCachedMessages(config);
  const sources = collectEventSources(messages);
  const refreshed: CachedEventRecord[] = [];

  for (const [canonicalUrl, sourceMessages] of [...sources.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const existing = await readJsonFileIfExists<CachedEventRecord>(eventCachePath(config, canonicalUrl));
    const sourceMessageIds = [...new Set(sourceMessages.map((message) => message.message_id))];
    const needsRefresh = !existing
      || shouldRefreshCachedEvent(existing)
      || sourceMessageIds.length !== existing.source_message_ids.length;

    const now = isoNow();
    const nextRecord: CachedEventRecord = {
      canonical_url: canonicalUrl,
      url_hash: urlHash(canonicalUrl),
      source_message_ids: sourceMessageIds,
      first_seen_at: existing?.first_seen_at ?? sourceMessages[0]?.received_at ?? now,
      last_seen_at: sourceMessages[sourceMessages.length - 1]?.received_at ?? now,
      ...(existing?.helper_response ? { helper_response: existing.helper_response } : {}),
      ...(existing?.last_fetched_at ? { last_fetched_at: existing.last_fetched_at } : {}),
      ...(existing?.next_refresh_at ? { next_refresh_at: existing.next_refresh_at } : {}),
      ...(existing?.content_hash ? { content_hash: existing.content_hash } : {}),
    };

    if (needsRefresh) {
      const helperResponse = await fetchHelperEvent(config, canonicalUrl, fetchImpl);
      nextRecord.helper_response = helperResponse;
      nextRecord.last_fetched_at = now;
      const nextRefreshAt = computeNextRefreshAt(helperResponse);
      if (nextRefreshAt) {
        nextRecord.next_refresh_at = nextRefreshAt;
      } else {
        delete nextRecord.next_refresh_at;
      }
      nextRecord.content_hash = helperResponse.content_hash;
    }

    await writeJsonAtomic(eventCachePath(config, canonicalUrl), nextRecord);
    refreshed.push(nextRecord);
  }

  await writeJsonAtomic(refreshStatePath(config), {
    refreshed_at: isoNow(),
    count: refreshed.length,
  });

  return refreshed;
}
