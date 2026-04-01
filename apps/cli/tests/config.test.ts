import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('cli config', () => {
  it('prefers INIT_CWD as repo root when run through npm workspaces', () => {
    const config = loadConfig(
      {
        INIT_CWD: '/tmp/luma-root',
      },
      '/tmp/luma-root/apps/cli',
    );

    expect(config.repoRoot).toBe('/tmp/luma-root');
    expect(config.runtimeRoot).toBe('/tmp/luma-root/.runtime');
  });
});
