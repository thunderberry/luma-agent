import path from 'node:path';

export interface CliConfig {
  repoRoot: string;
  helperBaseUrl?: string;
  helperBearerToken?: string;
  helperClientId?: string;
  runtimeRoot: string;
  stateDir: string;
  outputDir: string;
  latestInvitesPath: string;
  messageStatePath: string;
  eventCachePath: string;
  lastRunPath: string;
  latestFactsPath: string;
  latestMarkdownPath: string;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): CliConfig {
  const repoRoot = path.resolve(env.LUMA_REPO_ROOT ?? env.INIT_CWD ?? cwd);
  const runtimeRoot = path.join(repoRoot, '.runtime');
  const stateDir = path.join(runtimeRoot, 'state');
  const outputDir = path.resolve(env.LUMA_OUTPUT_DIR ?? path.join(runtimeRoot, 'output'));

  return {
    repoRoot,
    ...(env.LUMA_HELPER_BASE_URL ? { helperBaseUrl: env.LUMA_HELPER_BASE_URL } : {}),
    ...(env.LUMA_HELPER_BEARER_TOKEN ? { helperBearerToken: env.LUMA_HELPER_BEARER_TOKEN } : {}),
    ...(env.LUMA_HELPER_CLIENT_ID ? { helperClientId: env.LUMA_HELPER_CLIENT_ID } : {}),
    runtimeRoot,
    stateDir,
    outputDir,
    latestInvitesPath: path.join(stateDir, 'latest-invites.json'),
    messageStatePath: path.join(stateDir, 'message-state.json'),
    eventCachePath: path.join(stateDir, 'event-cache.json'),
    lastRunPath: path.join(stateDir, 'last-run.json'),
    latestFactsPath: path.join(outputDir, 'latest.json'),
    latestMarkdownPath: path.join(outputDir, 'latest.md'),
  };
}
