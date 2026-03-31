import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

function normalizeAbsolute(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  return resolved.endsWith(path.sep) && resolved.length > 1
    ? resolved.slice(0, -1)
    : resolved;
}

function isPathInside(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export class PathPolicy {
  private readonly allowedRoots: string[];

  constructor(roots: string[]) {
    const expandedRoots = new Set<string>();

    for (const root of roots) {
      const normalized = normalizeAbsolute(root);
      expandedRoots.add(normalized);
      if (existsSync(normalized)) {
        expandedRoots.add(normalizeAbsolute(realpathSync(normalized)));
      }
    }

    this.allowedRoots = [...expandedRoots];
  }

  getRoots(): string[] {
    return [...this.allowedRoots];
  }

  assertReadPath(targetPath: string): string {
    const absoluteTarget = normalizeAbsolute(targetPath);
    if (!existsSync(absoluteTarget)) {
      throw new Error(`Read path does not exist: ${absoluteTarget}`);
    }

    const realTarget = normalizeAbsolute(realpathSync(absoluteTarget));
    this.assertAllowed(realTarget, 'read');
    return realTarget;
  }

  assertListPath(targetPath: string): string {
    return this.assertReadPath(targetPath);
  }

  assertWritePath(targetPath: string): string {
    const absoluteTarget = normalizeAbsolute(targetPath);

    if (existsSync(absoluteTarget)) {
      const stat = lstatSync(absoluteTarget);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing write through symlink: ${absoluteTarget}`);
      }
      const realTarget = normalizeAbsolute(realpathSync(absoluteTarget));
      this.assertAllowed(realTarget, 'write');
      return realTarget;
    }

    const parent = path.dirname(absoluteTarget);
    const ancestor = this.findExistingAncestor(parent);
    if (lstatSync(ancestor).isSymbolicLink()) {
      throw new Error(`Refusing path traversal through symlink: ${ancestor}`);
    }
    const realAncestor = normalizeAbsolute(realpathSync(ancestor));
    this.assertAllowed(realAncestor, 'write');
    this.assertNoSymlinkSegments(ancestor, parent);

    if (!this.allowedRoots.some((root) => isPathInside(absoluteTarget, root))) {
      throw new Error(
        `Write path ${absoluteTarget} is outside allowed roots: ${this.allowedRoots.join(', ')}`,
      );
    }

    return absoluteTarget;
  }

  assertDirectoryCreatePath(dirPath: string): string {
    return this.assertWritePath(dirPath);
  }

  private findExistingAncestor(startPath: string): string {
    let current = normalizeAbsolute(startPath);
    while (!existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error(`Unable to resolve existing ancestor for: ${startPath}`);
      }
      current = parent;
    }
    return current;
  }

  private assertNoSymlinkSegments(fromDir: string, toDir: string): void {
    const relativePath = path.relative(fromDir, toDir);
    if (!relativePath || relativePath === '.') {
      return;
    }

    let cursor = fromDir;
    for (const segment of relativePath.split(path.sep)) {
      if (!segment || segment === '.') {
        continue;
      }
      cursor = path.join(cursor, segment);
      if (!existsSync(cursor)) {
        continue;
      }
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing path traversal through symlink: ${cursor}`);
      }
    }
  }

  private assertAllowed(targetPath: string, operation: 'read' | 'write'): void {
    if (this.allowedRoots.some((root) => isPathInside(targetPath, root))) {
      return;
    }
    throw new Error(
      `Refusing ${operation} outside allowlist. Target: ${targetPath}. Allowed roots: ${this.allowedRoots.join(', ')}`,
    );
  }
}
