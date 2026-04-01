import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import type { DailySummary, EventCheckResult, EventStatus } from '../types/index.js';
import { isUpcoming, isoNow, localDateStamp } from '../util/date.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeWriteFileAtomic, safeWriteJsonAtomic } from '../util/safe-fs.js';

const STATUS_ORDER: EventStatus[] = [
  'open',
  'approval_required',
  'waitlist',
  'closed',
  'unknown',
];

function buildCounts(events: EventCheckResult[]): DailySummary['counts'] {
  const counts: DailySummary['counts'] = {
    total: events.length,
    errors: 0,
    open: 0,
    approval_required: 0,
    waitlist: 0,
    closed: 0,
    unknown: 0,
  };

  for (const event of events) {
    counts[event.status] += 1;
    if (event.error) {
      counts.errors += 1;
    }
  }

  return counts;
}

function formatStartsAt(startsAt: string | undefined): string {
  if (!startsAt) {
    return 'unknown time';
  }
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown time';
  }
  return parsed.toISOString();
}

function formatLocation(event: EventCheckResult): string {
  return [event.venueName, event.city].filter(Boolean).join(', ')
    || event.locationText
    || 'unknown location';
}

function toMarkdown(summary: DailySummary): string {
  const lines: string[] = [];

  lines.push(`# Luma Daily Summary (${summary.runDate})`);
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Timezone: ${summary.timezone}`);
  lines.push('');
  lines.push('## Counts');
  lines.push(`- Total upcoming events: ${summary.counts.total}`);
  lines.push(`- Open: ${summary.counts.open}`);
  lines.push(`- Approval required: ${summary.counts.approval_required}`);
  lines.push(`- Waitlist: ${summary.counts.waitlist}`);
  lines.push(`- Closed: ${summary.counts.closed}`);
  lines.push(`- Unknown: ${summary.counts.unknown}`);
  lines.push(`- Errors: ${summary.counts.errors}`);
  lines.push('');

  for (const status of STATUS_ORDER) {
    lines.push(`## ${status} (${summary.counts[status]})`);

    const events = summary.events.filter((event) => event.status === status);
    if (events.length === 0) {
      lines.push('- none');
      lines.push('');
      continue;
    }

    for (const event of events) {
      const title = event.title ?? event.canonicalUrl;
      const finalUrl = event.finalUrl ?? event.sourceUrl;
      const signalSuffix =
        event.matchedSignals.length > 0
          ? ` | signals: ${event.matchedSignals.join(', ')}`
          : '';
      const errorSuffix = event.error ? ` | error: ${event.error}` : '';

      lines.push(
        `- [${title}](${finalUrl}) | starts: ${formatStartsAt(event.startsAt)}${signalSuffix}${errorSuffix}`,
      );
      lines.push(
        `  price: ${event.priceType ?? 'unknown'}${event.priceText ? ` (${event.priceText})` : ''} | location: ${formatLocation(event)} | organizer: ${event.organizerName ?? 'unknown'}`,
      );
      if (event.descriptionExcerpt) {
        lines.push(`  details: ${event.descriptionExcerpt}`);
      }
      if (event.popularitySignals && event.popularitySignals.length > 0) {
        lines.push(`  popularity: ${event.popularitySignals.join('; ')}`);
      }
      if (event.emailFacts) {
        const emailBits = [
          event.emailFacts.sender,
          event.emailFacts.snippet,
          event.emailFacts.inviteSignals.length > 0
            ? `signals: ${event.emailFacts.inviteSignals.join(', ')}`
            : undefined,
        ].filter(Boolean);
        if (emailBits.length > 0) {
          lines.push(`  email: ${emailBits.join(' | ')}`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function buildSummary(
  results: EventCheckResult[],
  config: AppConfig,
): DailySummary {
  const runDate = localDateStamp(config.timezone);
  const upcoming = results
    .filter((event) => isUpcoming(event.startsAt))
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  return {
    runDate,
    generatedAt: isoNow(),
    timezone: config.timezone,
    counts: buildCounts(upcoming),
    events: upcoming,
  };
}

export async function writeDailySummary(
  summary: DailySummary,
  config: AppConfig,
  policy: PathPolicy,
): Promise<void> {
  const datedBase = `${summary.runDate}-summary`;

  const datedMdPath = path.join(config.outputDir, `${datedBase}.md`);
  const datedJsonPath = path.join(config.outputDir, `${datedBase}.json`);
  const latestMdPath = path.join(config.outputDir, 'latest.md');
  const latestJsonPath = path.join(config.outputDir, 'latest.json');

  const markdown = toMarkdown(summary);

  await safeWriteFileAtomic(policy, datedMdPath, markdown);
  await safeWriteJsonAtomic(policy, datedJsonPath, summary);
  await safeWriteFileAtomic(policy, latestMdPath, markdown);
  await safeWriteJsonAtomic(policy, latestJsonPath, summary);
}
