import path from 'node:path';

export const DEFAULT_GMAIL_QUERY =
  '((from:(lu.ma OR luma-mail.com)) OR ("lu.ma/" OR "luma.com/")) newer_than:90d';

export interface CliConfig {
  repoRoot: string;
  timezone: string;
  gmailQuery: string;
  gmailMaxMessages: number;
  helperBaseUrl?: string;
  helperBearerToken?: string;
  helperClientId?: string;
  runtimeRoot: string;
  cacheDir: string;
  messageCacheDir: string;
  eventCacheDir: string;
  stateDir: string;
  contentDir: string;
  contentEventsDir: string;
  contentReportsDir: string;
  gmailTokenPath: string;
  gmailClientConfigPath: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, received: ${value}`);
  }
  return parsed;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CliConfig {
  const repoRoot = path.resolve(cwd);
  const runtimeRoot = path.join(repoRoot, '.runtime');
  const cacheDir = path.resolve(env.LUMA_CACHE_DIR ?? path.join(runtimeRoot, 'cache'));
  const stateDir = path.join(runtimeRoot, 'state');
  const contentDir = path.resolve(env.LUMA_CONTENT_DIR ?? path.join(repoRoot, 'content'));

  return {
    repoRoot,
    timezone: env.LUMA_REPORT_TIMEZONE ?? 'America/Los_Angeles',
    gmailQuery: env.LUMA_GMAIL_QUERY ?? DEFAULT_GMAIL_QUERY,
    gmailMaxMessages: parsePositiveInt(env.LUMA_GMAIL_MAX_MESSAGES, 250),
    ...(env.LUMA_HELPER_BASE_URL ? { helperBaseUrl: env.LUMA_HELPER_BASE_URL } : {}),
    ...(env.LUMA_HELPER_BEARER_TOKEN ? { helperBearerToken: env.LUMA_HELPER_BEARER_TOKEN } : {}),
    ...(env.LUMA_HELPER_CLIENT_ID ? { helperClientId: env.LUMA_HELPER_CLIENT_ID } : {}),
    runtimeRoot,
    cacheDir,
    messageCacheDir: path.join(cacheDir, 'messages'),
    eventCacheDir: path.join(cacheDir, 'events'),
    stateDir,
    contentDir,
    contentEventsDir: path.join(contentDir, 'events'),
    contentReportsDir: path.join(contentDir, 'reports'),
    gmailTokenPath: path.join(runtimeRoot, 'oauth', 'gmail-token.json'),
    gmailClientConfigPath: path.join(runtimeRoot, 'oauth', 'gmail-oauth-client.json'),
  };
}
