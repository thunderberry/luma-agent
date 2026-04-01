import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
}

export async function readJsonFile<T>(targetPath: string): Promise<T> {
  const content = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(content) as T;
}

export async function readJsonFileIfExists<T>(targetPath: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  await writeTextAtomic(targetPath, JSON.stringify(value, null, 2));
}

export async function writeTextAtomic(targetPath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  const tmpPath = path.join(path.dirname(targetPath), `.tmp-${path.basename(targetPath)}-${randomUUID()}`);
  await fs.writeFile(tmpPath, value, 'utf8');
  await fs.rename(tmpPath, targetPath);
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function listJsonFiles(targetDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(targetDir);
    return entries.filter((entry) => entry.endsWith('.json')).map((entry) => path.join(targetDir, entry));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function clearDirectory(targetDir: string): Promise<void> {
  await ensureDir(targetDir);
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true })),
  );
}
