import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../../src/config/env.js';
import { buildSummary, writeDailySummary } from '../../src/output/summary-writer.js';
import type { EventCheckResult } from '../../src/types/index.js';
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

describe('summary writer', () => {
  it('writes dated and latest markdown/json outputs', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputDir = mkdtempSync(path.join(os.tmpdir(), 'luma-output-'));
    const config = testConfig(repoRoot, outputDir);
    const policy = new PathPolicy(config.allowedRoots);

    const checks: EventCheckResult[] = [
      {
        canonicalUrl: 'https://lu.ma/a',
        sourceUrl: 'https://lu.ma/a',
        status: 'open',
        matchedSignals: ['reserve spot'],
        checkedAt: new Date().toISOString(),
      },
    ];

    const summary = buildSummary(checks, config);
    await writeDailySummary(summary, config, policy);

    const latestJson = path.join(outputDir, 'latest.json');
    const latestMd = path.join(outputDir, 'latest.md');
    const datedJson = path.join(outputDir, `${summary.runDate}-summary.json`);
    const datedMd = path.join(outputDir, `${summary.runDate}-summary.md`);

    expect(readFileSync(latestJson, 'utf8')).toContain('"counts"');
    expect(readFileSync(latestMd, 'utf8')).toContain('# Luma Daily Summary');
    expect(readFileSync(datedJson, 'utf8')).toContain('"open"');
    expect(readFileSync(datedMd, 'utf8')).toContain('## open');
  });
});
