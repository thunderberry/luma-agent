import {
  isoNow,
  type FetchLumaEventResponse,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';
import { ensureDir, readJsonFileIfExists, writeJsonAtomic } from './fs.js';
import {
  loadNormalizedInvitesFromFile,
  persistLatestInviteRun,
  type NormalizedInvite,
  type NormalizedInviteRunFile,
  type NormalizedInviteRunRecord,
} from './invite-input.js';
import { fetchHelperFactsViaMcp } from './mcp-helper-client.js';

const MAX_TRACKED_IDS = 5000;

export interface ProcessedMessageState {
  last_successful_run_at?: string;
  last_processed_received_at?: string;
  processed_message_ids: string[];
  processed_event_urls: string[];
}

export interface CachedEventRecord {
  canonical_url: string;
  source_message_ids: string[];
  first_seen_at: string;
  last_seen_at: string;
  last_fetched_at?: string;
  helper_response?: FetchLumaEventResponse;
}

export interface ProcessInvitesResult {
  run_id: string;
  generated_at: string;
  input_path: string;
  total_input_invites: number;
  new_message_count: number;
  repeated_message_count: number;
  new_event_count: number;
  fetched_this_run_count: number;
  cached_event_count: number;
  helper_facts_count: number;
  latest_invites_path: string;
  latest_facts_path: string;
  message_state_path: string;
  event_cache_path: string;
}

function defaultMessageState(): ProcessedMessageState {
  return {
    processed_message_ids: [],
    processed_event_urls: [],
  };
}

function trimTrackedValues(values: Iterable<string>): string[] {
  const deduped = [...new Set(values)];
  return deduped.slice(Math.max(0, deduped.length - MAX_TRACKED_IDS));
}

function computeLatestReceivedAt(invites: NormalizedInvite[]): string | undefined {
  const timestamps = invites
    .map((invite) => new Date(invite.received_at).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function buildInviteRun(
  invites: NormalizedInvite[],
  sourcePath: string,
  previousState: ProcessedMessageState,
): NormalizedInviteRunFile {
  const runId = `run-${Date.now().toString(36)}`;
  const knownMessageIds = new Set(previousState.processed_message_ids);
  const knownEventUrls = new Set(previousState.processed_event_urls);
  const newlySeenEventUrls = new Set<string>();

  const records: NormalizedInviteRunRecord[] = invites.map((invite) => {
    const isNewMessage = !knownMessageIds.has(invite.message_id);
    const isNewEventUrl = isNewMessage
      && !knownEventUrls.has(invite.canonical_url)
      && !newlySeenEventUrls.has(invite.canonical_url);

    if (isNewEventUrl) {
      newlySeenEventUrls.add(invite.canonical_url);
    }

    return {
      ...invite,
      is_new_message: isNewMessage,
      is_new_event_url: isNewEventUrl,
    };
  });

  return {
    run_id: runId,
    generated_at: isoNow(),
    source_path: sourcePath,
    new_message_ids: records.filter((record) => record.is_new_message).map((record) => record.message_id),
    repeated_message_ids: records.filter((record) => !record.is_new_message).map((record) => record.message_id),
    new_event_urls: records.filter((record) => record.is_new_event_url).map((record) => record.canonical_url),
    repeated_event_urls: records.filter((record) => !record.is_new_event_url).map((record) => record.canonical_url),
    invites: records,
  };
}

function updateMessageState(
  previousState: ProcessedMessageState,
  runFile: NormalizedInviteRunFile,
): ProcessedMessageState {
  const latestReceivedAt = computeLatestReceivedAt(runFile.invites);

  return {
    last_successful_run_at: isoNow(),
    ...(latestReceivedAt ? { last_processed_received_at: latestReceivedAt } : {}),
    processed_message_ids: trimTrackedValues([
      ...previousState.processed_message_ids,
      ...runFile.new_message_ids,
    ]),
    processed_event_urls: trimTrackedValues([
      ...previousState.processed_event_urls,
      ...runFile.new_event_urls,
    ]),
  };
}

function buildInviteIndex(invites: NormalizedInviteRunRecord[]): Map<string, NormalizedInviteRunRecord[]> {
  const byUrl = new Map<string, NormalizedInviteRunRecord[]>();
  for (const invite of invites) {
    const existing = byUrl.get(invite.canonical_url) ?? [];
    existing.push(invite);
    byUrl.set(invite.canonical_url, existing);
  }
  return byUrl;
}

function toEventCacheMap(records: CachedEventRecord[]): Map<string, CachedEventRecord> {
  return new Map(records.map((record) => [record.canonical_url, record]));
}

function latestSeenAt(invites: NormalizedInviteRunRecord[], fallback: string): string {
  const parsed = invites
    .map((invite) => new Date(invite.received_at).getTime())
    .filter((value) => Number.isFinite(value));
  if (parsed.length === 0) {
    return fallback;
  }
  return new Date(Math.max(...parsed)).toISOString();
}

export async function processInvites(
  config: CliConfig,
  inputPath: string,
  helperFetcher: (
    config: CliConfig,
    urls: string[],
  ) => Promise<FetchLumaEventResponse[]> = fetchHelperFactsViaMcp,
): Promise<ProcessInvitesResult> {
  await ensureDir(config.stateDir);
  await ensureDir(config.outputDir);

  const previousState = await readJsonFileIfExists<ProcessedMessageState>(config.messageStatePath)
    ?? defaultMessageState();
  const previousCache = await readJsonFileIfExists<CachedEventRecord[]>(config.eventCachePath)
    ?? [];
  const loaded = await loadNormalizedInvitesFromFile(inputPath);
  const runFile = buildInviteRun(loaded.invites, loaded.sourcePath, previousState);

  await persistLatestInviteRun(config, runFile);

  const inviteIndex = buildInviteIndex(runFile.invites);
  const cacheByUrl = toEventCacheMap(previousCache);
  const urlsToFetch = [...new Set([
    ...runFile.new_event_urls,
    ...runFile.invites
      .map((invite) => invite.canonical_url)
      .filter((url) => !cacheByUrl.has(url)),
  ])];
  const fetchedFacts = await helperFetcher(config, urlsToFetch);
  const fetchedByUrl = new Map(
    fetchedFacts
      .flatMap((fact) => (typeof fact.url === 'string' && fact.url ? [[fact.url, fact] as const] : [])),
  );
  const mergedByUrl = new Map(cacheByUrl);
  const mergeTimestamp = isoNow();

  for (const [canonicalUrl, invitesForUrl] of inviteIndex.entries()) {
    const existing = mergedByUrl.get(canonicalUrl);
    const sourceMessageIds = [...new Set([
      ...(existing?.source_message_ids ?? []),
      ...invitesForUrl.map((invite) => invite.message_id),
    ])];
    const fetched = fetchedByUrl.get(canonicalUrl);

    const nextRecord: CachedEventRecord = {
      canonical_url: canonicalUrl,
      source_message_ids: sourceMessageIds,
      first_seen_at: existing?.first_seen_at ?? invitesForUrl[0]?.received_at ?? mergeTimestamp,
      last_seen_at: latestSeenAt(invitesForUrl, existing?.last_seen_at ?? mergeTimestamp),
      ...(existing?.helper_response ? { helper_response: existing.helper_response } : {}),
      ...(existing?.last_fetched_at ? { last_fetched_at: existing.last_fetched_at } : {}),
    };

    if (fetched) {
      nextRecord.helper_response = fetched;
      nextRecord.last_fetched_at = mergeTimestamp;
    }

    mergedByUrl.set(canonicalUrl, nextRecord);
  }

  const mergedCache = [...mergedByUrl.values()].sort((a, b) => a.canonical_url.localeCompare(b.canonical_url));
  await writeJsonAtomic(config.eventCachePath, mergedCache);

  const helperFacts = mergedCache
    .map((record) => record.helper_response)
    .filter((fact): fact is FetchLumaEventResponse => Boolean(fact));
  await writeJsonAtomic(config.latestFactsPath, helperFacts);

  const nextState = updateMessageState(previousState, runFile);
  await writeJsonAtomic(config.messageStatePath, nextState);

  const result: ProcessInvitesResult = {
    run_id: runFile.run_id,
    generated_at: runFile.generated_at,
    input_path: runFile.source_path,
    total_input_invites: runFile.invites.length,
    new_message_count: runFile.new_message_ids.length,
    repeated_message_count: runFile.repeated_message_ids.length,
    new_event_count: runFile.new_event_urls.length,
    fetched_this_run_count: fetchedFacts.length,
    cached_event_count: mergedCache.length,
    helper_facts_count: helperFacts.length,
    latest_invites_path: config.latestInvitesPath,
    latest_facts_path: config.latestFactsPath,
    message_state_path: config.messageStatePath,
    event_cache_path: config.eventCachePath,
  };

  await writeJsonAtomic(config.lastRunPath, result);

  return result;
}
