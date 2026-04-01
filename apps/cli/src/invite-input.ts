import path from 'node:path';

import {
  canonicalizeLumaUrl,
  isoNow,
  urlHash,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';
import { readJsonFile, writeJsonAtomic } from './fs.js';

export interface NormalizedInvite {
  message_id: string;
  thread_id?: string;
  received_at: string;
  subject?: string;
  sender?: string;
  snippet?: string;
  raw_url: string;
  canonical_url: string;
}

export interface NormalizedInviteRunRecord extends NormalizedInvite {
  is_new_message: boolean;
  is_new_event_url: boolean;
}

export interface NormalizedInviteRunFile {
  run_id: string;
  generated_at: string;
  source_path: string;
  new_message_ids: string[];
  repeated_message_ids: string[];
  new_event_urls: string[];
  repeated_event_urls: string[];
  invites: NormalizedInviteRunRecord[];
}

type InviteInputValue =
  | string
  | {
      messageId?: string;
      threadId?: string;
      receivedAt?: string;
      subject?: string;
      sender?: string;
      snippet?: string;
      rawUrl?: string;
      canonicalUrl?: string;
      url?: string;
    };

interface InviteInputFile {
  invites?: InviteInputValue[];
}

function normalizeReceivedAt(value: string | undefined): string {
  if (!value) {
    return isoNow();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return isoNow();
  }

  return parsed.toISOString();
}

function normalizeInvite(value: InviteInputValue, index: number): NormalizedInvite | null {
  if (typeof value === 'string') {
    const canonicalUrl = canonicalizeLumaUrl(value);
    if (!canonicalUrl) {
      return null;
    }

    return {
      message_id: `external-${urlHash(canonicalUrl)}`,
      received_at: isoNow(),
      raw_url: value,
      canonical_url: canonicalUrl,
    };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const rawUrl = value.rawUrl ?? value.url ?? value.canonicalUrl;
  if (!rawUrl) {
    return null;
  }

  const canonicalUrl = canonicalizeLumaUrl(value.canonicalUrl ?? rawUrl);
  if (!canonicalUrl) {
    return null;
  }

  const normalized: NormalizedInvite = {
    message_id: value.messageId?.trim() || `external-${index + 1}-${urlHash(canonicalUrl)}`,
    received_at: normalizeReceivedAt(value.receivedAt),
    raw_url: rawUrl,
    canonical_url: canonicalUrl,
  };

  if (value.threadId?.trim()) {
    normalized.thread_id = value.threadId.trim();
  }
  if (value.subject?.trim()) {
    normalized.subject = value.subject.trim();
  }
  if (value.sender?.trim()) {
    normalized.sender = value.sender.trim();
  }
  if (value.snippet?.trim()) {
    normalized.snippet = value.snippet.trim();
  }

  return normalized;
}

function normalizeCollection(input: unknown): NormalizedInvite[] {
  const rawItems = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as InviteInputFile).invites)
      ? (input as InviteInputFile).invites
      : null;

  if (!rawItems) {
    throw new Error(
      'Invite input must be an array of URLs/records or an object with an invites array.',
    );
  }

  const byMessageAndUrl = new Map<string, NormalizedInvite>();

  rawItems.forEach((item, index) => {
    const normalized = normalizeInvite(item, index);
    if (!normalized) {
      return;
    }

    const key = `${normalized.message_id}::${normalized.canonical_url}`;
    const existing = byMessageAndUrl.get(key);
    if (!existing) {
      byMessageAndUrl.set(key, normalized);
      return;
    }

    if (new Date(normalized.received_at).getTime() > new Date(existing.received_at).getTime()) {
      byMessageAndUrl.set(key, normalized);
    }
  });

  return [...byMessageAndUrl.values()].sort((a, b) => a.received_at.localeCompare(b.received_at));
}

export async function loadNormalizedInvitesFromFile(inputPath: string): Promise<{
  invites: NormalizedInvite[];
  sourcePath: string;
}> {
  const sourcePath = path.resolve(inputPath);
  const parsed = await readJsonFile<unknown>(sourcePath);

  return {
    invites: normalizeCollection(parsed),
    sourcePath,
  };
}

export async function persistLatestInviteRun(
  config: CliConfig,
  file: NormalizedInviteRunFile,
): Promise<void> {
  await writeJsonAtomic(config.latestInvitesPath, file);
}
