import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { PathPolicy } from './path-policy.js';

export async function safeMkdir(
  policy: PathPolicy,
  targetDir: string,
): Promise<string> {
  const approvedDir = policy.assertDirectoryCreatePath(targetDir);
  await fs.mkdir(approvedDir, { recursive: true });
  return approvedDir;
}

export async function safeReadFile(
  policy: PathPolicy,
  targetPath: string,
  encoding: BufferEncoding = 'utf8',
): Promise<string> {
  const approvedPath = policy.assertReadPath(targetPath);
  return fs.readFile(approvedPath, { encoding });
}

export async function safeReadJson<T>(
  policy: PathPolicy,
  targetPath: string,
): Promise<T> {
  const content = await safeReadFile(policy, targetPath, 'utf8');
  return JSON.parse(content) as T;
}

export async function safeWriteFileAtomic(
  policy: PathPolicy,
  targetPath: string,
  content: string,
): Promise<void> {
  const approvedPath = policy.assertWritePath(targetPath);
  const parentDir = path.dirname(approvedPath);
  await safeMkdir(policy, parentDir);

  const tmpPath = path.join(
    parentDir,
    `.tmp-${path.basename(approvedPath)}-${randomUUID()}`,
  );
  const approvedTmp = policy.assertWritePath(tmpPath);

  await fs.writeFile(approvedTmp, content, 'utf8');
  await fs.rename(approvedTmp, approvedPath);
}

export async function safeWriteJsonAtomic(
  policy: PathPolicy,
  targetPath: string,
  value: unknown,
): Promise<void> {
  await safeWriteFileAtomic(policy, targetPath, JSON.stringify(value, null, 2));
}

export async function safeListDir(
  policy: PathPolicy,
  targetDir: string,
): Promise<string[]> {
  const approvedDir = policy.assertListPath(targetDir);
  return fs.readdir(approvedDir);
}

export async function safeFileExists(
  policy: PathPolicy,
  targetPath: string,
): Promise<boolean> {
  try {
    policy.assertReadPath(targetPath);
    return true;
  } catch {
    return false;
  }
}
