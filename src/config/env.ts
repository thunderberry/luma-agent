import path from 'node:path';

export const DEFAULT_GMAIL_QUERY =
  'from:(lu.ma OR luma-mail.com) newer_than:90d';

export interface AppConfig {
  repoRoot: string;
  outputDir: string;
  timezone: string;
  gmailQuery: string;
  gmailMaxMessages: number;
  checkTimeoutMs: number;
  checkConcurrency: number;
  runtimeRoot: string;
  runtimeOAuthDir: string;
  runtimeStateDir: string;
  runtimeTmpDir: string;
  runtimeCacheDir: string;
  runtimeLogsDir: string;
  runtimePlaywrightDir: string;
  gmailTokenPath: string;
  gmailClientConfigPath: string;
  allowedRoots: string[];
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): AppConfig {
  const repoRoot = path.resolve(env.LUMA_REPO_ROOT ?? cwd);
  const defaultOutputDir = path.join(repoRoot, '.runtime', 'output');
  const outputDir = path.resolve(env.LUMA_OUTPUT_DIR ?? defaultOutputDir);

  const runtimeRoot = path.join(repoRoot, '.runtime');
  const runtimeOAuthDir = path.join(runtimeRoot, 'oauth');
  const runtimeStateDir = path.join(runtimeRoot, 'state');
  const runtimeTmpDir = path.join(runtimeRoot, 'tmp');
  const runtimeCacheDir = path.join(runtimeRoot, 'cache');
  const runtimeLogsDir = path.join(runtimeRoot, 'logs');
  const runtimePlaywrightDir = path.join(runtimeRoot, 'playwright-browsers');

  return {
    repoRoot,
    outputDir,
    timezone: env.LUMA_TIMEZONE ?? 'America/Los_Angeles',
    gmailQuery: env.LUMA_GMAIL_QUERY ?? DEFAULT_GMAIL_QUERY,
    gmailMaxMessages: parsePositiveInt(
      env.LUMA_GMAIL_MAX_MESSAGES,
      250,
      'LUMA_GMAIL_MAX_MESSAGES',
    ),
    checkTimeoutMs: parsePositiveInt(
      env.LUMA_CHECK_TIMEOUT_MS,
      30000,
      'LUMA_CHECK_TIMEOUT_MS',
    ),
    checkConcurrency: parsePositiveInt(
      env.LUMA_CHECK_CONCURRENCY,
      3,
      'LUMA_CHECK_CONCURRENCY',
    ),
    runtimeRoot,
    runtimeOAuthDir,
    runtimeStateDir,
    runtimeTmpDir,
    runtimeCacheDir,
    runtimeLogsDir,
    runtimePlaywrightDir,
    gmailTokenPath: path.join(runtimeOAuthDir, 'gmail-token.json'),
    gmailClientConfigPath: path.join(runtimeOAuthDir, 'gmail-oauth-client.json'),
    allowedRoots: [repoRoot, outputDir],
  };
}
