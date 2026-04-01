import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createPathPolicy, ensureRuntimeDirectories } from '../../src/pipeline/runtime.js';
import { persistRetrievalProof, runRetrievalProof } from '../../src/retrieval/retrieval-proof.js';

describe('retrieval proof', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('persists raw html and metadata under repo-local runtime storage', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'luma-agent-proof-'));
    tempDirs.push(repoRoot);

    const config = loadConfig({}, repoRoot);
    const policy = createPathPolicy(config);
    await ensureRuntimeDirectories(config, policy);

    const record = await persistRetrievalProof(
      {
        requestedUrl: 'https://lu.ma/demo-event',
        finalUrl: 'https://lu.ma/demo-event',
        status: 200,
        ok: true,
        contentType: 'text/html',
        contentLength: 31,
        contentLengthSource: 'header',
        fetchedAt: '2026-03-31T18:00:00.000Z',
        html: '<html><body>Phase 0</body></html>',
        htmlExcerpt: '<html><body>Phase 0</body></html>',
      },
      config,
      policy,
    );

    const html = await readFile(record.htmlPath, 'utf8');
    const metadata = JSON.parse(await readFile(record.metadataPath, 'utf8')) as {
      requestedUrl: string;
      htmlPath: string;
    };

    expect(html).toBe('<html><body>Phase 0</body></html>');
    expect(metadata.requestedUrl).toBe('https://lu.ma/demo-event');
    expect(metadata.htmlPath).toBe(record.htmlPath);
  });

  it('persists failed http fetches before surfacing an error', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'luma-agent-proof-'));
    tempDirs.push(repoRoot);

    const config = loadConfig({}, repoRoot);
    const policy = createPathPolicy(config);
    await ensureRuntimeDirectories(config, policy);

    const mockFetch = (async () =>
      ({
        url: 'https://lu.ma/demo-event',
        status: 403,
        ok: false,
        headers: new Headers({
          'content-type': 'text/html',
        }),
        text: async () => '<html><body>Forbidden</body></html>',
      }) as Response) as typeof fetch;

    await expect(runRetrievalProof(config, policy, 'https://lu.ma/demo-event', mockFetch)).rejects.toThrow(
      /HTTP 403/,
    );

    const latestPath = path.join(config.runtimeStateDir, 'phase0-fetch', 'latest.json');
    const latest = JSON.parse(await readFile(latestPath, 'utf8')) as {
      status: number;
      ok: boolean;
    };

    expect(latest.status).toBe(403);
    expect(latest.ok).toBe(false);
  });
});
