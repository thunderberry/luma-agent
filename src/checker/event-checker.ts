import path from 'node:path';

import { chromium, type Page } from 'playwright';

import type { AppConfig } from '../config/env.js';
import { classifyStatus } from '../classifier/status-classifier.js';
import type { EventCheckResult, InviteLink } from '../types/index.js';
import { isoNow } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeWriteJsonAtomic } from '../util/safe-fs.js';
import { buildChromiumLaunchOptions } from './headless-policy.js';

async function extractStartDate(page: Page): Promise<string | undefined> {
  const count = await page.locator('time[datetime]').count();
  if (count > 0) {
    const value = await page.locator('time[datetime]').first().getAttribute('datetime');
    if (value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  const jsonLdScripts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  for (const scriptText of jsonLdScripts) {
    try {
      const parsed = JSON.parse(scriptText) as unknown;
      const extracted = findStartDate(parsed);
      if (extracted) {
        return extracted;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function findStartDate(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const candidate = findStartDate(item);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }

  const objectNode = node as Record<string, unknown>;
  const startDate = objectNode.startDate;
  if (typeof startDate === 'string') {
    const parsed = new Date(startDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  for (const value of Object.values(objectNode)) {
    const candidate = findStartDate(value);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

async function extractTitle(page: Page): Promise<string | undefined> {
  const h1Count = await page.locator('h1').count();
  if (h1Count > 0) {
    const h1 = await page.locator('h1').first().innerText();
    const trimmed = h1.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  const title = await page.title();
  return title.trim() || undefined;
}

async function extractCtaTexts(page: Page): Promise<string[]> {
  const raw = await page.locator('button, [role="button"], a').allInnerTexts();
  const cleaned = raw.map((item) => item.trim()).filter(Boolean);
  return cleaned.slice(0, 150);
}

async function checkSingleEvent(
  invite: InviteLink,
  page: Page,
  timeoutMs: number,
): Promise<EventCheckResult> {
  const checkedAt = isoNow();

  try {
    await page.goto(invite.rawUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    await page.waitForTimeout(1000);

    const [title, startsAt, ctaTexts] = await Promise.all([
      extractTitle(page),
      extractStartDate(page),
      extractCtaTexts(page),
    ]);

    const pageText = await page.locator('body').innerText().catch(() => '');
    const classified = classifyStatus({ pageText, ctaTexts });

    const result: EventCheckResult = {
      canonicalUrl: invite.canonicalUrl,
      sourceUrl: invite.rawUrl,
      finalUrl: page.url(),
      status: classified.status,
      matchedSignals: classified.matchedSignals,
      checkedAt,
    };
    if (title) {
      result.title = title;
    }
    if (startsAt) {
      result.startsAt = startsAt;
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
    const finalUrl = page.url();
    if (finalUrl) {
      result.finalUrl = finalUrl;
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

  const browser = await chromium.launch(buildChromiumLaunchOptions());

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      timezoneId: config.timezone,
    });

    const results = await mapWithConcurrency(
      invites,
      config.checkConcurrency,
      async (invite) => {
        const page = await context.newPage();
        try {
          return await checkSingleEvent(invite, page, config.checkTimeoutMs);
        } finally {
          await page.close();
        }
      },
    );

    await context.close();
    return results;
  } finally {
    await browser.close();
  }
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
