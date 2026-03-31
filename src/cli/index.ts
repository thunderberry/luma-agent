import { authorizeGmail } from '../gmail/auth.js';
import { loadConfig } from '../config/env.js';
import {
  runCheckEvents,
  runDaily,
  runFetchInvites,
  runSummarize,
} from '../pipeline/run-daily.js';
import { createPathPolicy } from '../pipeline/runtime.js';

function parseInputPath(args: string[]): string | undefined {
  const index = args.findIndex((arg) => arg === '--input');
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value) {
    throw new Error('--input flag requires a file path value');
  }
  return value;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: node dist/src/cli/index.js <command> [--input PATH] [--manual-auth]',
      '',
      'Commands:',
      '  auth-gmail      Run one-time Gmail OAuth token setup (auto browser + callback capture)',
      '  fetch-invites   Fetch invite links from Gmail and persist state',
      '  check-events    Run headless checks from latest or provided invite state',
      '  summarize       Generate summary from latest or provided checks state',
      '  run-daily       End-to-end run (non-interactive auth expected)',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const config = loadConfig();
  const policy = createPathPolicy(config);

  switch (command) {
    case 'auth-gmail': {
      await authorizeGmail(config, policy, {
        preferBrowserLogin: !hasFlag(rest, '--manual-auth'),
      });
      process.stdout.write('Gmail authorization completed.\n');
      return;
    }
    case 'fetch-invites': {
      const invites = await runFetchInvites(config, policy);
      process.stdout.write(JSON.stringify({ count: invites.length, invites }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'check-events': {
      const input = parseInputPath(rest);
      const results = await runCheckEvents(config, policy, input);
      process.stdout.write(JSON.stringify({ count: results.length, results }, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'summarize': {
      const input = parseInputPath(rest);
      const summary = await runSummarize(config, policy, input);
      process.stdout.write(JSON.stringify(summary, null, 2));
      process.stdout.write('\n');
      return;
    }
    case 'run-daily': {
      const summary = await runDaily(config, policy);
      process.stdout.write(JSON.stringify(summary, null, 2));
      process.stdout.write('\n');
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
