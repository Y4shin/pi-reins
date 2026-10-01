/**
 * Fixture handling for the test harness: copies a fixture directory
 * (from tests/fixtures/) into a fresh temporary directory and returns
 * its path. Each caller gets an isolated, disposable plan directory.
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(dirnameOf(import.meta.url), "..", "..", "tests", "fixtures");

function dirnameOf(moduleUrl: string): string {
  return fileURLToPath(new URL(".", moduleUrl));
}

const created: string[] = [];

export function copyFixture(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `reins-fixture-${name.replace(/[^a-z0-9-]/gi, "")}-`));
  cpSync(join(FIXTURES_DIR, name), dir, { recursive: true });
  created.push(dir);
  return dir;
}

/** Copy a fixture's contents into an existing target directory. */
export function copyFixtureContents(name: string, target: string): void {
  cpSync(join(FIXTURES_DIR, name), target, { recursive: true });
}

/** Remove every temp directory created by copyFixture. */
export function cleanupFixtures(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
