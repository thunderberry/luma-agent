import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';

describe('env config', () => {
  it('defaults output into repo-local runtime directory', () => {
    const repoRoot = '/tmp/luma-repo';
    const config = loadConfig({}, repoRoot);

    expect(config.outputDir).toBe(path.join(repoRoot, '.runtime', 'output'));
    expect(config.allowedRoots).toContain(repoRoot);
    expect(config.allowedRoots).toContain(path.join(repoRoot, '.runtime', 'output'));
  });

  it('allows explicit output override for trusted destinations', () => {
    const repoRoot = '/tmp/luma-repo';
    const config = loadConfig(
      {
        LUMA_OUTPUT_DIR: '/tmp/custom-output',
      },
      repoRoot,
    );

    expect(config.outputDir).toBe('/tmp/custom-output');
    expect(config.allowedRoots).toContain('/tmp/custom-output');
  });
});
