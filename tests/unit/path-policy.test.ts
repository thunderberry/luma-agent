import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PathPolicy } from '../../src/util/path-policy.js';

describe('path policy', () => {
  it('allows read/write inside allowlisted roots', () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-output-'));
    const policy = new PathPolicy([repoRoot, outputRoot]);

    const file = path.join(repoRoot, 'state.json');
    writeFileSync(file, '{}', 'utf8');

    expect(policy.assertReadPath(file)).toContain(repoRoot);
    expect(policy.assertWritePath(path.join(outputRoot, 'latest.json'))).toContain(
      outputRoot,
    );
  });

  it('rejects read outside allowlisted roots', () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-output-'));
    const outside = mkdtempSync(path.join(os.tmpdir(), 'luma-outside-'));
    const file = path.join(outside, 'x.txt');
    writeFileSync(file, 'x', 'utf8');

    const policy = new PathPolicy([repoRoot, outputRoot]);

    expect(() => policy.assertReadPath(file)).toThrow(/outside allowlist/i);
  });

  it('rejects write paths that traverse symlinks', () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-output-'));
    const outside = mkdtempSync(path.join(os.tmpdir(), 'luma-outside-'));

    const linkPath = path.join(repoRoot, 'linked');
    symlinkSync(outside, linkPath);

    const policy = new PathPolicy([repoRoot, outputRoot]);

    expect(() => policy.assertWritePath(path.join(linkPath, 'escape.txt'))).toThrow(
      /symlink/i,
    );
  });
});
