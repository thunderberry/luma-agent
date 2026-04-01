import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import { extractEmailFacts } from './email-facts.js';
import type { EmailFacts, InviteLink } from '../types/index.js';
import { isoNow } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeReadJson, safeWriteJsonAtomic } from '../util/safe-fs.js';
import {
  canonicalizeInviteUrl,
  dedupeInvites,
} from './link-parser.js';

interface InviteStateFile {
  invites?: unknown;
}

interface InviteInputRecord {
  messageId?: string;
  threadId?: string;
  receivedAt?: string;
  subject?: string;
  sender?: string;
  snippet?: string;
  emailFacts?: EmailFacts;
  rawUrl?: string;
  canonicalUrl?: string;
  url?: string;
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

function normalizeInviteRecord(value: unknown, index: number): InviteLink | null {
  if (typeof value === 'string') {
    const canonicalUrl = canonicalizeInviteUrl(value);
    if (!canonicalUrl) {
      return null;
    }
    return {
      messageId: `external-${index + 1}`,
      receivedAt: isoNow(),
      rawUrl: value,
      canonicalUrl,
    };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as InviteInputRecord;
  const rawUrl = record.rawUrl ?? record.url ?? record.canonicalUrl;
  if (!rawUrl) {
    return null;
  }

  const canonicalUrl = canonicalizeInviteUrl(record.canonicalUrl ?? rawUrl);
  if (!canonicalUrl) {
    return null;
  }

  const invite: InviteLink = {
    messageId: record.messageId?.trim() || `external-${index + 1}`,
    receivedAt: normalizeReceivedAt(record.receivedAt),
    rawUrl,
    canonicalUrl,
  };

  if (record.threadId?.trim()) {
    invite.threadId = record.threadId.trim();
  }
  if (record.subject?.trim()) {
    invite.subject = record.subject.trim();
  }
  if (record.sender?.trim()) {
    invite.sender = record.sender.trim();
  }
  if (record.snippet?.trim()) {
    invite.snippet = record.snippet.trim();
  }
  if (record.emailFacts) {
    invite.emailFacts = record.emailFacts;
  } else if (invite.subject || invite.sender || invite.snippet) {
    const derived = extractEmailFacts({
      bodyText: [invite.subject, invite.snippet].filter(Boolean).join('\n'),
      subject: invite.subject,
      sender: invite.sender,
      snippet: invite.snippet,
      receivedAt: invite.receivedAt,
    });
    if (
      derived.titleHint ||
      derived.organizerHint ||
      derived.startsAt ||
      derived.locationText ||
      derived.inviteSignals.length > 0
    ) {
      invite.emailFacts = derived;
    }
  }

  return invite;
}

function normalizeInviteCollection(value: unknown): InviteLink[] {
  let rawItems: unknown[] | null = null;
  if (Array.isArray(value)) {
    rawItems = value;
  } else if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as InviteStateFile).invites)
  ) {
    rawItems = (value as InviteStateFile).invites as unknown[];
  }

  if (!rawItems) {
    throw new Error(
      'Invite input must be an array of invite URLs/records or an object with an invites array.',
    );
  }

  return dedupeInvites(
    rawItems
      .map((item, index) => normalizeInviteRecord(item, index))
      .filter((item): item is InviteLink => item !== null),
  );
}

export async function loadInviteLinksFromFile(
  config: AppConfig,
  policy: PathPolicy,
  inputPath: string,
): Promise<InviteLink[]> {
  const absoluteInput = path.resolve(inputPath);
  const parsed = await safeReadJson<unknown>(policy, absoluteInput);
  const invites = normalizeInviteCollection(parsed);

  await safeWriteJsonAtomic(
    policy,
    path.join(config.runtimeStateDir, 'latest-invites.json'),
    {
      generatedAt: isoNow(),
      sourcePath: absoluteInput,
      invites,
    },
  );

  return invites;
}
