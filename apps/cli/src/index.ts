import { loadConfig } from './config.js';
import { loadCachedMessages, loadCachedEvents, refreshEvents } from './event-cache.js';
import { renderContentArtifacts, writeUpcomingReport } from './reports.js';
import { syncGmail } from './gmail-sync.js';

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: node dist/src/index.js <command>',
      '',
      'Commands:',
      '  sync:gmail',
      '  refresh:events',
      '  render:content',
      '  report:upcoming',
      '  run:daily',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const [, , command] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const config = loadConfig();

  switch (command) {
    case 'sync:gmail': {
      const created = await syncGmail(config);
      process.stdout.write(JSON.stringify({ count: created.length }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'refresh:events': {
      const refreshed = await refreshEvents(config);
      process.stdout.write(JSON.stringify({ count: refreshed.length }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'render:content': {
      const messages = await loadCachedMessages(config);
      const events = await loadCachedEvents(config);
      const artifacts = await renderContentArtifacts(config, events, messages);
      process.stdout.write(JSON.stringify({ count: artifacts.length }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'report:upcoming': {
      const messages = await loadCachedMessages(config);
      const events = await loadCachedEvents(config);
      const report = await writeUpcomingReport(config, events, messages);
      process.stdout.write(JSON.stringify({ count: report.events.length }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'run:daily': {
      await syncGmail(config);
      const refreshed = await refreshEvents(config);
      const messages = await loadCachedMessages(config);
      await renderContentArtifacts(config, refreshed, messages);
      const report = await writeUpcomingReport(config, refreshed, messages);
      process.stdout.write(JSON.stringify({ count: report.events.length }, null, 2));
      process.stdout.write('\n');
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
