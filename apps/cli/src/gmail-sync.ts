import { Buffer } from 'node:buffer';
import path from 'node:path';

import {
  canonicalizeLumaUrl,
  type CachedMessageRecord,
  isoNow,
} from '@luma-agent/shared';
import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

import type { CliConfig } from './config.js';
import { ensureDir, fileExists, readJsonFileIfExists, writeJsonAtomic } from './fs.js';
import { getAuthorizedGmailClient } from './gmail-auth.js';

interface GmailSyncState {
  last_successful_sync_at?: string;
  query: string;
  processed_message_count: number;
}

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;
const HREF_REGEX = /href\s*=\s*["']([^"']+)["']/gi;

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function collectPartBodies(
  part: gmail_v1.Schema$MessagePart | undefined,
  textBodies: string[],
  htmlBodies: string[],
): void {
  if (!part) {
    return;
  }

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType?.includes('text/plain')) {
      textBodies.push(decoded);
    }
    if (part.mimeType?.includes('text/html')) {
      htmlBodies.push(decoded);
    }
  }

  for (const child of part.parts ?? []) {
    collectPartBodies(child, textBodies, htmlBodies);
  }
}

function extractPlainTextFromMessagePart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];
  collectPartBodies(payload, textBodies, htmlBodies);

  const textContent = cleanText(textBodies.join('\n'));
  if (textContent) {
    return textContent;
  }

  return cleanText(htmlBodies.join('\n').replace(/<[^>]+>/g, ' '));
}

function stripTrailingJunk(value: string): string {
  return value.replace(/[),.;!?]+$/g, '').trim();
}

function toRawUrl(candidate: string): string | null {
  const cleaned = stripTrailingJunk(candidate);
  try {
    const parsed = new URL(cleaned);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractLumaUrlsFromMessagePart(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string[] {
  const textBodies: string[] = [];
  const htmlBodies: string[] = [];
  collectPartBodies(payload, textBodies, htmlBodies);

  const candidates: string[] = [];

  for (const text of textBodies) {
    candidates.push(...(text.match(URL_REGEX) ?? []));
  }

  for (const html of htmlBodies) {
    const regex = new RegExp(HREF_REGEX.source, HREF_REGEX.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      if (match[1]) {
        candidates.push(match[1]);
      }
    }
    candidates.push(...(html.match(URL_REGEX) ?? []));
  }

  return [...new Set(
    candidates
      .map((candidate) => toRawUrl(candidate))
      .filter((value): value is string => Boolean(value))
      .map((value) => canonicalizeLumaUrl(value))
      .filter((value): value is string => Boolean(value)),
  )];
}

function getHeaderValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  headerName: string,
): string | undefined {
  const found = headers?.find(
    (header) => header.name?.toLowerCase() === headerName.toLowerCase(),
  );
  return found?.value ?? undefined;
}

function parseReceivedAt(headerValue: string | undefined): string {
  if (!headerValue) {
    return isoNow();
  }
  const parsed = new Date(headerValue);
  if (Number.isNaN(parsed.getTime())) {
    return isoNow();
  }
  return parsed.toISOString();
}

export function extractInviteSignals(input: {
  subject?: string;
  snippet?: string;
  bodyText: string;
}): string[] {
  const haystack = [input.subject, input.snippet, input.bodyText].filter(Boolean).join('\n');
  const signals: string[] = [];

  if (/you(?:'|’)re invited to/i.test(haystack)) {
    signals.push("you're invited");
  }
  if (/you have registered for/i.test(haystack)) {
    signals.push('registration confirmed');
  }
  if (/you(?:'|’)ve got a spot at/i.test(haystack)) {
    signals.push('approved');
  }
  if (/thanks for joining/i.test(haystack)) {
    signals.push('post-event followup');
  }

  return signals;
}

export function buildIncrementalQuery(baseQuery: string, lastSyncAt?: string): string {
  if (!lastSyncAt) {
    return baseQuery;
  }

  const parsed = new Date(lastSyncAt);
  if (Number.isNaN(parsed.getTime())) {
    return baseQuery;
  }

  return `${baseQuery} after:${Math.floor(parsed.getTime() / 1000)}`;
}

function messageCachePath(config: CliConfig, messageId: string): string {
  return path.join(config.messageCacheDir, `${messageId}.json`);
}

function statePath(config: CliConfig): string {
  return path.join(config.stateDir, 'last-gmail-sync.json');
}

export async function syncGmail(config: CliConfig): Promise<CachedMessageRecord[]> {
  await ensureDir(config.messageCacheDir);
  await ensureDir(config.stateDir);

  const lastState = await readJsonFileIfExists<GmailSyncState>(statePath(config));
  const query = buildIncrementalQuery(config.gmailQuery, lastState?.last_successful_sync_at);

  const auth = await getAuthorizedGmailClient(config);
  const gmail = google.gmail({ version: 'v1', auth });

  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const params: gmail_v1.Params$Resource$Users$Messages$List = {
      userId: 'me',
      q: query,
      maxResults: Math.min(config.gmailMaxMessages - messageIds.length, 500),
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }
    const response = await gmail.users.messages.list(params);
    for (const message of response.data.messages ?? []) {
      if (message.id) {
        messageIds.push(message.id);
      }
      if (messageIds.length >= config.gmailMaxMessages) {
        break;
      }
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken && messageIds.length < config.gmailMaxMessages);

  const created: CachedMessageRecord[] = [];

  for (const messageId of messageIds) {
    if (await fileExists(messageCachePath(config, messageId))) {
      continue;
    }

    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const payload = message.data.payload;
    const subject = getHeaderValue(payload?.headers, 'Subject');
    const sender = getHeaderValue(payload?.headers, 'From');
    const snippet = message.data.snippet ?? undefined;
    const receivedAt = parseReceivedAt(getHeaderValue(payload?.headers, 'Date'));
    const bodyText = extractPlainTextFromMessagePart(payload);
    const extractedUrls = extractLumaUrlsFromMessagePart(payload);

    if (extractedUrls.length === 0) {
      continue;
    }

    const record: CachedMessageRecord = {
      message_id: messageId,
      ...(message.data.threadId ? { thread_id: message.data.threadId } : {}),
      ...(sender ? { sender } : {}),
      ...(subject ? { subject } : {}),
      ...(snippet ? { snippet } : {}),
      received_at: receivedAt,
      extracted_urls: extractedUrls,
      invite_signals: extractInviteSignals({
        ...(subject ? { subject } : {}),
        ...(snippet ? { snippet } : {}),
        bodyText,
      }),
      processed_at: isoNow(),
    };

    await writeJsonAtomic(messageCachePath(config, messageId), record);
    created.push(record);
  }

  await writeJsonAtomic(statePath(config), {
    last_successful_sync_at: isoNow(),
    query,
    processed_message_count: created.length,
  } satisfies GmailSyncState);

  return created;
}
