import path from 'node:path';

import {
  eventSlug,
  isUpcoming,
  localDateStamp,
  renderEventMarkdown,
  renderUpcomingReportMarkdown,
  type CachedEventRecord,
  type CachedMessageRecord,
  type EventArtifactRecord,
  type UpcomingEventsReport,
  isoNow,
} from '@luma-agent/shared';

import type { CliConfig } from './config.js';
import { ensureDir, writeJsonAtomic, writeTextAtomic } from './fs.js';

function mergeArtifacts(
  events: CachedEventRecord[],
  messages: CachedMessageRecord[],
): EventArtifactRecord[] {
  const messagesById = new Map(messages.map((message) => [message.message_id, message]));

  return events.map((event) => {
    const sourceMessages = event.source_message_ids
      .map((messageId) => messagesById.get(messageId))
      .filter((value): value is CachedMessageRecord => Boolean(value));
    const slugSource = event.helper_response
      ? {
          canonical_url: event.canonical_url,
          helper_response: event.helper_response,
        }
      : {
          canonical_url: event.canonical_url,
        };
    const base: EventArtifactRecord = {
      slug: eventSlug(slugSource),
      canonical_url: event.canonical_url,
      source_messages: sourceMessages,
      ...(event.helper_response ? { helper_response: event.helper_response } : {}),
    };
    return base;
  });
}

export async function renderContentArtifacts(
  config: CliConfig,
  events: CachedEventRecord[],
  messages: CachedMessageRecord[],
): Promise<EventArtifactRecord[]> {
  await ensureDir(config.contentEventsDir);

  const artifacts = mergeArtifacts(events, messages);
  for (const artifact of artifacts) {
    const basePath = path.join(config.contentEventsDir, artifact.slug);
    await writeJsonAtomic(`${basePath}.json`, artifact);
    await writeTextAtomic(`${basePath}.md`, renderEventMarkdown(artifact));
  }

  return artifacts;
}

export async function writeUpcomingReport(
  config: CliConfig,
  events: CachedEventRecord[],
  messages: CachedMessageRecord[],
): Promise<UpcomingEventsReport> {
  await ensureDir(config.contentReportsDir);

  const artifacts = mergeArtifacts(events, messages)
    .filter((artifact) => isUpcoming(artifact.helper_response?.starts_at))
    .sort((a, b) => {
      const aTime = a.helper_response?.starts_at
        ? new Date(a.helper_response.starts_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.helper_response?.starts_at
        ? new Date(b.helper_response.starts_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  const report: UpcomingEventsReport = {
    run_date: localDateStamp(config.timezone),
    generated_at: isoNow(),
    timezone: config.timezone,
    events: artifacts,
  };

  const basePath = path.join(config.contentReportsDir, report.run_date);
  await writeJsonAtomic(`${basePath}.json`, report);
  await writeTextAtomic(`${basePath}.md`, renderUpcomingReportMarkdown(report));

  return report;
}
