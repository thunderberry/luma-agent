import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import { classifyStatus } from '../classifier/status-classifier.js';
import { fetchEventPageFacts } from './http-event-extractor.js';
import type { EventCheckResult, InviteLink } from '../types/index.js';
import { isoNow } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeWriteJsonAtomic } from '../util/safe-fs.js';

async function checkSingleEvent(
  invite: InviteLink,
  timeoutMs: number,
): Promise<EventCheckResult> {
  const checkedAt = isoNow();

  try {
    const pageFacts = await fetchEventPageFacts(invite.rawUrl, timeoutMs);
    const classified = classifyStatus({
      pageText: pageFacts.pageText,
      ctaTexts: pageFacts.ctaTexts,
    });

    const result: EventCheckResult = {
      canonicalUrl: invite.canonicalUrl,
      sourceUrl: invite.rawUrl,
      finalUrl: pageFacts.finalUrl,
      status: classified.status,
      matchedSignals: classified.matchedSignals,
      checkedAt,
      priceType: pageFacts.priceType ?? 'unknown',
    };

    const title = pageFacts.title ?? invite.emailFacts?.titleHint ?? invite.subject;
    if (title) {
      result.title = title;
    }
    const startsAt = pageFacts.startsAt ?? invite.emailFacts?.startsAt;
    if (startsAt) {
      result.startsAt = startsAt;
    }
    const organizerName = pageFacts.organizerName ?? invite.emailFacts?.organizerHint;
    if (organizerName) {
      result.organizerName = organizerName;
    }
    if (pageFacts.priceText) {
      result.priceText = pageFacts.priceText;
    }
    const locationType = pageFacts.locationType ?? invite.emailFacts?.locationType;
    if (locationType) {
      result.locationType = locationType;
    }
    const locationText = pageFacts.locationText ?? invite.emailFacts?.locationText;
    if (locationText) {
      result.locationText = locationText;
    }
    const venueName = pageFacts.venueName ?? invite.emailFacts?.venueName;
    if (venueName) {
      result.venueName = venueName;
    }
    const city = pageFacts.city ?? invite.emailFacts?.city;
    if (city) {
      result.city = city;
    }
    if (pageFacts.descriptionExcerpt) {
      result.descriptionExcerpt = pageFacts.descriptionExcerpt;
    }
    if (pageFacts.popularitySignals.length > 0) {
      result.popularitySignals = pageFacts.popularitySignals;
    }
    if (invite.emailFacts) {
      result.emailFacts = invite.emailFacts;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown checker error';
    const result: EventCheckResult = {
      canonicalUrl: invite.canonicalUrl,
      sourceUrl: invite.rawUrl,
      status: 'unknown',
      matchedSignals: [],
      checkedAt,
      error: message,
    };

    const title = invite.emailFacts?.titleHint ?? invite.subject;
    if (title) {
      result.title = title;
    }
    if (invite.emailFacts?.startsAt) {
      result.startsAt = invite.emailFacts.startsAt;
    }
    if (invite.emailFacts?.organizerHint) {
      result.organizerName = invite.emailFacts.organizerHint;
    }
    if (invite.emailFacts?.locationType) {
      result.locationType = invite.emailFacts.locationType;
    }
    if (invite.emailFacts?.locationText) {
      result.locationText = invite.emailFacts.locationText;
    }
    if (invite.emailFacts?.venueName) {
      result.venueName = invite.emailFacts.venueName;
    }
    if (invite.emailFacts?.city) {
      result.city = invite.emailFacts.city;
    }
    if (invite.emailFacts) {
      result.emailFacts = invite.emailFacts;
    }

    return result;
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  mapper: (value: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const normalizedConcurrency = Math.max(1, concurrency);
  const results: TOutput[] = new Array(values.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(values.length, normalizedConcurrency) }).map(
    async () => {
      while (true) {
        const index = currentIndex;
        currentIndex += 1;
        if (index >= values.length) {
          return;
        }
        const value = values[index] as TInput;
        results[index] = await mapper(value);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function checkEventStatuses(
  invites: InviteLink[],
  config: AppConfig,
): Promise<EventCheckResult[]> {
  if (invites.length === 0) {
    return [];
  }

  return mapWithConcurrency(invites, config.checkConcurrency, (invite) =>
    checkSingleEvent(invite, config.checkTimeoutMs),
  );
}

export async function checkEventStatusesAndPersist(
  invites: InviteLink[],
  config: AppConfig,
  policy: PathPolicy,
): Promise<EventCheckResult[]> {
  const results = await checkEventStatuses(invites, config);
  const outputPath = path.join(config.runtimeStateDir, 'latest-checks.json');
  await safeWriteJsonAtomic(policy, outputPath, {
    checkedAt: isoNow(),
    count: results.length,
    results,
  });
  return results;
}
