/**
 * Plan-directory write utilities.
 *
 * Frontmatter field writes that preserve document bodies and stamp the
 * OKF `generated` family (`{ by, at }`) on every plugin write, per the
 * execution-plan contract. The actor for `generated.by` is
 * `pi-reins/<version>`; `generated.at` records content freshness only.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import type { FsPort } from "../deps.js";
import { dumpDocument, splitFrontmatter, type FrontmatterData } from "./parse.js";

export interface WriteDeps {
  fs: FsPort;
  now: () => string;
}

let cachedGeneratedBy: string | null = null;

/** The plugin actor for `generated.by`: "pi-reins/<version>". */
export function generatedBy(): string {
  if (cachedGeneratedBy !== null) return cachedGeneratedBy;
  try {
    const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    cachedGeneratedBy = `pi-reins/${pkg.version ?? "0.0.0"}`;
  } catch {
    cachedGeneratedBy = "pi-reins/unknown";
  }
  return cachedGeneratedBy;
}

/**
 * Set frontmatter fields on a document, preserving its body verbatim
 * and stamping `generated`. Existing fields stay; provided fields
 * override. Writing a document whose frontmatter does not parse throws
 * (callers surface that as a tool error); parsing a plan directory
 * never does.
 */
export function writeFields(
  deps: WriteDeps,
  file: string,
  fields: FrontmatterData,
): void {
  const text = deps.fs.read(file);
  const split = splitFrontmatter(text);

  let data: FrontmatterData = {};
  if (split.frontmatterText !== null) {
    const parsed = YAML.parse(split.frontmatterText);
    if (parsed !== null && parsed !== undefined) {
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`cannot write fields: frontmatter of ${file} is not a mapping`);
      }
      data = parsed as FrontmatterData;
    }
  }

  data = { ...data, ...fields };
  data.generated = { by: generatedBy(), at: deps.now() };

  deps.fs.write(file, dumpDocument(data, split.body));
}
