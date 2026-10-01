/**
 * Production FsPort over node:fs, scoped to a root directory.
 *
 * Every path is resolved against the root and must stay inside it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { FsPort } from "../deps.js";

function joinRoot(root: string, path: string): string {
  const absolute = isAbsolute(path) ? path : join(root, path);
  const normalized = resolve(absolute);
  const normalizedRoot = resolve(root);
  if (normalized !== normalizedRoot && !normalized.startsWith(normalizedRoot + sep)) {
    throw new Error(`path escapes the fs root: ${path}`);
  }
  return normalized;
}

export class NodeFsPort implements FsPort {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  read(path: string): string {
    return readFileSync(joinRoot(this.root, path), "utf8");
  }

  exists(path: string): boolean {
    return existsSync(joinRoot(this.root, path));
  }

  list(path = ""): string[] {
    const base = joinRoot(this.root, path);
    // A non-directory base (e.g. the attach path points at a file) is
    // an empty listing, never a crash: the plan-directory module
    // reports it as findings instead.
    if (!existsSync(base) || !statSync(base).isDirectory()) return [];
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else {
          out.push(relative(this.root, full).split(sep).join("/"));
        }
      }
    };
    walk(base);
    return out.sort();
  }

  write(path: string, content: string): void {
    const absolute = joinRoot(this.root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }

  delete(path: string): void {
    rmSync(joinRoot(this.root, path));
  }
}

export function createNodeFsPort(root: string): FsPort {
  return new NodeFsPort(root);
}
