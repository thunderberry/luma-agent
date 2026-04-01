import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import type { PathPolicy } from '../util/path-policy.js';
import { safeWriteFileAtomic, safeWriteJsonAtomic } from '../util/safe-fs.js';
import { fetchEventPageHtml, buildFetchSlug, type EventPageFetchResult } from './http-fetch.js';

export interface RetrievalProofRecord {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType?: string;
  contentLength: number;
  contentLengthSource: 'header' | 'body_bytes';
  fetchedAt: string;
  htmlExcerpt: string;
  htmlPath: string;
  metadataPath: string;
}

function buildProofPaths(
  config: AppConfig,
  fetchedAt: string,
  requestedUrl: string,
): Pick<RetrievalProofRecord, 'htmlPath' | 'metadataPath'> {
  const timestamp = fetchedAt.replaceAll(':', '-').replaceAll('.', '-');
  const stem = `${timestamp}-${buildFetchSlug(requestedUrl)}`;

  return {
    htmlPath: path.join(config.runtimeCacheDir, 'phase0-fetch', `${stem}.html`),
    metadataPath: path.join(config.runtimeStateDir, 'phase0-fetch', `${stem}.json`),
  };
}

export async function persistRetrievalProof(
  result: EventPageFetchResult,
  config: AppConfig,
  policy: PathPolicy,
): Promise<RetrievalProofRecord> {
  const paths = buildProofPaths(config, result.fetchedAt, result.requestedUrl);
  const record: RetrievalProofRecord = {
    requestedUrl: result.requestedUrl,
    finalUrl: result.finalUrl,
    status: result.status,
    ok: result.ok,
    contentLength: result.contentLength,
    contentLengthSource: result.contentLengthSource,
    fetchedAt: result.fetchedAt,
    htmlExcerpt: result.htmlExcerpt,
    htmlPath: paths.htmlPath,
    metadataPath: paths.metadataPath,
    ...(result.contentType ? { contentType: result.contentType } : {}),
  };

  await safeWriteFileAtomic(policy, record.htmlPath, result.html);
  await safeWriteJsonAtomic(policy, record.metadataPath, record);
  await safeWriteJsonAtomic(
    policy,
    path.join(config.runtimeStateDir, 'phase0-fetch', 'latest.json'),
    record,
  );

  return record;
}

export async function runRetrievalProof(
  config: AppConfig,
  policy: PathPolicy,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RetrievalProofRecord> {
  const result = await fetchEventPageHtml(url, config.checkTimeoutMs, fetchImpl);
  const record = await persistRetrievalProof(result, config, policy);

  if (!result.ok) {
    throw new Error(
      `Phase 0 retrieval fetch failed with HTTP ${result.status}. Metadata persisted to ${record.metadataPath}.`,
    );
  }

  return record;
}
