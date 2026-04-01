import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../../src/config/env.js';
import { loadInviteLinksFromFile } from '../../src/gmail/invite-source.js';
import { PathPolicy } from '../../src/util/path-policy.js';

function testConfig(repoRoot: string, outputDir: string): AppConfig {
  const runtimeRoot = path.join(repoRoot, '.runtime');
  return {
    repoRoot,
    outputDir,
    timezone: 'America/Los_Angeles',
    gmailQuery: 'from:lu.ma',
    gmailMaxMessages: 10,
    checkTimeoutMs: 1000,
    checkConcurrency: 1,
    runtimeRoot,
    runtimeOAuthDir: path.join(runtimeRoot, 'oauth'),
    runtimeStateDir: path.join(runtimeRoot, 'state'),
    runtimeTmpDir: path.join(runtimeRoot, 'tmp'),
    runtimeCacheDir: path.join(runtimeRoot, 'cache'),
    runtimeLogsDir: path.join(runtimeRoot, 'logs'),
    runtimePlaywrightDir: path.join(runtimeRoot, 'playwright-browsers'),
    gmailTokenPath: path.join(runtimeRoot, 'oauth', 'gmail-token.json'),
    gmailClientConfigPath: path.join(runtimeRoot, 'oauth', 'gmail-oauth-client.json'),
    allowedRoots: [repoRoot, outputDir],
  };
}

describe('invite source ingestion', () => {
  it('normalizes mixed invite input and persists latest-invites state', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputDir = path.join(repoRoot, '.runtime', 'output');
    const config = testConfig(repoRoot, outputDir);
    const policy = new PathPolicy(config.allowedRoots);

    const inputPath = path.join(repoRoot, 'connector-invites.json');
    writeFileSync(
      inputPath,
      JSON.stringify(
        {
          invites: [
            'https://lu.ma/demo-one?tk=123',
            {
              messageId: 'msg-2',
              subject: 'Demo',
              receivedAt: '2026-03-30T12:00:00.000Z',
              rawUrl: 'https://lu.ma/demo-two',
            },
            {
              rawUrl: 'https://example.com/not-luma',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const invites = await loadInviteLinksFromFile(config, policy, inputPath);

    expect(invites).toHaveLength(2);
    expect(invites[0]?.canonicalUrl).toBe('https://lu.ma/demo-one');
    expect(invites[1]?.messageId).toBe('msg-2');

    const persisted = path.join(config.runtimeStateDir, 'latest-invites.json');
    expect(policy.assertReadPath(persisted)).toContain(path.join(repoRoot, '.runtime'));
  });

  it('rejects invalid connector input shapes', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputDir = path.join(repoRoot, '.runtime', 'output');
    const config = testConfig(repoRoot, outputDir);
    const policy = new PathPolicy(config.allowedRoots);

    const inputPath = path.join(repoRoot, 'bad-input.json');
    writeFileSync(inputPath, JSON.stringify({ nope: true }), 'utf8');

    await expect(loadInviteLinksFromFile(config, policy, inputPath)).rejects.toThrow(
      /invites array/i,
    );
  });
});
