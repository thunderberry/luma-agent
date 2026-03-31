import path from 'node:path';

import type { AppConfig } from '../config/env.js';
import { PathPolicy } from '../util/path-policy.js';
import { safeMkdir } from '../util/safe-fs.js';

export function createPathPolicy(config: AppConfig): PathPolicy {
  return new PathPolicy(config.allowedRoots);
}

export async function ensureRuntimeDirectories(
  config: AppConfig,
  policy: PathPolicy,
): Promise<void> {
  const directories = [
    config.outputDir,
    config.runtimeRoot,
    config.runtimeOAuthDir,
    config.runtimeStateDir,
    config.runtimeTmpDir,
    config.runtimeCacheDir,
    config.runtimeLogsDir,
    config.runtimePlaywrightDir,
    path.join(config.runtimeRoot, 'home'),
  ];

  for (const directory of directories) {
    await safeMkdir(policy, directory);
  }
}

export async function configureProcessEnvironment(
  config: AppConfig,
  policy: PathPolicy,
): Promise<void> {
  await ensureRuntimeDirectories(config, policy);

  const runtimeHome = path.join(config.runtimeRoot, 'home');
  const runtimeTmp = config.runtimeTmpDir;
  const runtimeCache = config.runtimeCacheDir;

  process.env.HOME = runtimeHome;
  process.env.TMPDIR = runtimeTmp;
  process.env.XDG_CACHE_HOME = runtimeCache;
  process.env.PLAYWRIGHT_BROWSERS_PATH = config.runtimePlaywrightDir;
}
