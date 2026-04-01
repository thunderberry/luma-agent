import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

import type { AppConfig } from '../config/env.js';
import type { InviteLink } from '../types/index.js';
import { isoNow } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeWriteJsonAtomic } from '../util/safe-fs.js';
import { getAuthorizedGmailClient } from './auth.js';
import { extractEmailFacts } from './email-facts.js';
import {
  canonicalizeInviteUrl,
  extractPlainTextFromMessagePart,
  dedupeInvites,
  extractLumaUrlsFromMessagePart,
} from './link-parser.js';

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

export async function fetchInviteLinks(
  config: AppConfig,
  policy: PathPolicy,
  interactiveAuth = false,
): Promise<InviteLink[]> {
  const auth = await getAuthorizedGmailClient(config, policy, interactiveAuth);
  const gmail = google.gmail({ version: 'v1', auth });

  const messageIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const params: gmail_v1.Params$Resource$Users$Messages$List = {
      userId: 'me',
      q: config.gmailQuery,
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

  const invites: InviteLink[] = [];

  for (const messageId of messageIds) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const payload = message.data.payload;
    const headers = payload?.headers;

    const receivedAtHeader = getHeaderValue(headers, 'Date');
    const subject = getHeaderValue(headers, 'Subject');
    const sender = getHeaderValue(headers, 'From');

    const receivedAt = parseReceivedAt(receivedAtHeader);
    const bodyText = extractPlainTextFromMessagePart(payload);
    const emailFacts = extractEmailFacts({
      bodyText,
      subject,
      sender,
      snippet: message.data.snippet ?? undefined,
      receivedAt,
    });

    const urls = extractLumaUrlsFromMessagePart(payload);

    for (const rawUrl of urls) {
      const canonicalUrl = canonicalizeInviteUrl(rawUrl);
      if (!canonicalUrl) {
        continue;
      }

      const invite: InviteLink = {
        messageId,
        receivedAt,
        rawUrl,
        canonicalUrl,
      };
      if (message.data.threadId) {
        invite.threadId = message.data.threadId;
      }
      if (subject) {
        invite.subject = subject;
      }
      if (sender) {
        invite.sender = sender;
      }
      if (message.data.snippet) {
        invite.snippet = message.data.snippet;
      }
      if (
        emailFacts.titleHint ||
        emailFacts.organizerHint ||
        emailFacts.startsAt ||
        emailFacts.locationText ||
        emailFacts.inviteSignals.length > 0
      ) {
        invite.emailFacts = emailFacts;
      }
      invites.push(invite);
    }
  }

  return dedupeInvites(invites);
}

export async function fetchInviteLinksAndPersist(
  config: AppConfig,
  policy: PathPolicy,
  interactiveAuth = false,
): Promise<InviteLink[]> {
  const invites = await fetchInviteLinks(config, policy, interactiveAuth);
  const outputPath = `${config.runtimeStateDir}/latest-invites.json`;
  await safeWriteJsonAtomic(policy, outputPath, {
    generatedAt: isoNow(),
    query: config.gmailQuery,
    invites,
  });
  return invites;
}
