/**
 * The inert-load check: the one live-CLI exception outside the default
 * gate. The extension must load in a print-mode pi session via the CLI
 * extension argument, exit 0 with no errors, and leave no side effects
 * in the working directory. Skipped when the pi binary is absent.
 *
 * The empty prompt argument is what makes print mode load extensions
 * and exit 0 without any LLM call (verified against pi 0.84.4).
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function hasPiBinary(): boolean {
  const probe = spawnSync("pi", ["--version"], { encoding: "utf8", timeout: 30_000 });
  return !probe.error && probe.status === 0;
}

/** Sorted listing of every file under dir, excluding node_modules and .git. */
function listTree(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    out.push(relative(base, full));
    try {
      out.push(...listTree(full, base));
    } catch {
      // not a directory
    }
  }
  return out;
}

describe.skipIf(!hasPiBinary())("inert load via the pi CLI", () => {
  it(
    "loads the extension in print mode and exits 0 with no errors and no side effects",
    () => {
      const before = listTree(REPO_ROOT);

      const result = spawnSync(
        "pi",
        ["-p", "--no-extensions", "-e", "./src/pi.ts", ""],
        { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const output = (result.stdout ?? "") + (result.stderr ?? "");
      expect(output).not.toContain("Failed to load extension");
      expect(listTree(REPO_ROOT)).toEqual(before);
    },
    180_000,
  );
});
