import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PathPolicy } from '../../src/util/path-policy.js';
import {
  safeMkdir,
  safeReadFile,
  safeWriteFileAtomic,
} from '../../src/util/safe-fs.js';

describe('confinement integration', () => {
  it('blocks out-of-scope operations and allows in-scope writes', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-repo-'));
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-output-'));
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), 'luma-outside-'));

    const policy = new PathPolicy([repoRoot, outputRoot]);

    const inScopeFile = path.join(repoRoot, 'ok.txt');
    await safeWriteFileAtomic(policy, inScopeFile, 'ok');
    expect(readFileSync(inScopeFile, 'utf8')).toBe('ok');

    await expect(
      safeWriteFileAtomic(policy, path.join(outsideRoot, 'bad.txt'), 'bad'),
    ).rejects.toThrow(/outside allowlist/i);

    await expect(safeMkdir(policy, path.join(outsideRoot, 'subdir'))).rejects.toThrow(
      /outside allowed roots|outside allowlist/i,
    );

    await expect(safeReadFile(policy, path.join(outsideRoot, 'bad.txt'))).rejects.toThrow();
  });
});
