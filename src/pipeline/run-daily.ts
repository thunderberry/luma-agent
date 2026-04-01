import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import { checkEventStatusesAndPersist } from '../checker/event-checker.js';
import { fetchInviteLinksAndPersist } from '../gmail/fetch-invites.js';
import { loadInviteLinksFromFile } from '../gmail/invite-source.js';
import { buildSummary, writeDailySummary } from '../output/summary-writer.js';
import { runRetrievalProof, type RetrievalProofRecord } from '../retrieval/retrieval-proof.js';
import type { DailySummary, EventCheckResult, InviteLink } from '../types/index.js';
import { isoNow } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeReadJson, safeWriteJsonAtomic } from '../util/safe-fs.js';
import { configureProcessEnvironment } from './runtime.js';

interface InviteStateFile {
  invites: InviteLink[];
}

interface CheckStateFile {
  results: EventCheckResult[];
}

export async function runDaily(
  config: AppConfig,
  policy: PathPolicy,
  inputPath?: string,
): Promise<DailySummary> {
  await configureProcessEnvironment(config, policy);

  const invites = inputPath
    ? await loadInviteLinksFromFile(config, policy, inputPath)
    : await fetchInviteLinksAndPersist(config, policy, false);
  const checks = await checkEventStatusesAndPersist(invites, config, policy);
  const summary = buildSummary(checks, config);
  await writeDailySummary(summary, config, policy);

  await safeWriteJsonAtomic(policy, path.join(config.runtimeStateDir, 'last-run.json'), {
    generatedAt: isoNow(),
    inviteCount: invites.length,
    checkedCount: checks.length,
    summaryCount: summary.counts.total,
  });

  return summary;
}

export async function runFetchInvites(
  config: AppConfig,
  policy: PathPolicy,
): Promise<InviteLink[]> {
  await configureProcessEnvironment(config, policy);
  return fetchInviteLinksAndPersist(config, policy, true);
}

export async function runCheckEvents(
  config: AppConfig,
  policy: PathPolicy,
  inputPath?: string,
): Promise<EventCheckResult[]> {
  await configureProcessEnvironment(config, policy);
  const defaultInput = path.join(config.runtimeStateDir, 'latest-invites.json');
  const sourcePath = inputPath ?? defaultInput;

  if (inputPath) {
    const invites = await loadInviteLinksFromFile(config, policy, sourcePath);
    return checkEventStatusesAndPersist(invites, config, policy);
  }

  const inviteState = await safeReadJson<InviteStateFile>(policy, sourcePath);
  return checkEventStatusesAndPersist(inviteState.invites ?? [], config, policy);
}

export async function runSummarize(
  config: AppConfig,
  policy: PathPolicy,
  inputPath?: string,
): Promise<DailySummary> {
  await configureProcessEnvironment(config, policy);
  const defaultInput = path.join(config.runtimeStateDir, 'latest-checks.json');
  const sourcePath = inputPath ?? defaultInput;
  const checkState = await safeReadJson<CheckStateFile>(policy, sourcePath);
  const summary = buildSummary(checkState.results ?? [], config);
  await writeDailySummary(summary, config, policy);
  return summary;
}

export async function runPhase0Fetch(
  config: AppConfig,
  policy: PathPolicy,
  url: string,
): Promise<RetrievalProofRecord> {
  await configureProcessEnvironment(config, policy);
  return runRetrievalProof(config, policy, url);
}
