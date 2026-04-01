import { loadConfig } from './config.js';
import { processInvites } from './process-invites.js';

function parseRequiredInputPath(args: string[]): string {
  const index = args.findIndex((arg) => arg === '--input');
  if (index === -1) {
    throw new Error('--input is required and must point to a normalized invite JSON file.');
  }

  const value = args[index + 1];
  if (!value) {
    throw new Error('--input flag requires a file path value.');
  }

  return value;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: node dist/src/index.js <command> --input PATH',
      '',
      'Commands:',
      '  process-invites',
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

  switch (command) {
    case 'process-invites': {
      const inputPath = parseRequiredInputPath(rest);
      const result = await processInvites(config, inputPath);
      process.stdout.write(JSON.stringify(result, null, 2));
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
