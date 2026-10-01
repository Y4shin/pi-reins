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

/** The plan-root change log (reserved OKF filename at the plan root). */
export const LOG_FILE = "log.md";

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
  opts: { remove?: string[] } = {},
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

  for (const key of opts.remove ?? []) delete data[key];
  data = { ...data, ...fields };
  data.generated = { by: generatedBy(), at: deps.now() };

  deps.fs.write(file, dumpDocument(data, split.body));
}

/**
 * Append a `verified` event (`{ by, at }`, OKF 0.2 §5.2) to a plan
 * document's frontmatter: a list, extending an existing list or
 * normalizing a bare single-event mapping to one first (upstream §5.2).
 * The actor is the human actor id with the `human:` prefix applied
 * here, at the verified-event write (upstream §7): the event reads as
 * human-reviewed. Written together with the corresponding log entry by
 * the same writer at the call site, so the two records cannot diverge.
 */
export function appendVerifiedEvent(deps: WriteDeps, file: string, actor: string): void {
  const split = splitFrontmatter(deps.fs.read(file));
  let data: FrontmatterData = {};
  if (split.frontmatterText !== null) {
    const parsed = YAML.parse(split.frontmatterText);
    if (parsed !== null && parsed !== undefined) {
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`cannot append a verified event: frontmatter of ${file} is not a mapping`);
      }
      data = parsed as FrontmatterData;
    }
  }

  const existing = data.verified;
  if (existing !== undefined && existing !== null && typeof existing !== "object") {
    throw new Error(
      `cannot append a verified event: "verified" in ${file} is ${typeof existing}, not an event or event list`,
    );
  }
  const events: unknown[] = Array.isArray(existing) ? [...existing] : existing != null ? [existing] : [];
  events.push({ by: `human:${actor}`, at: deps.now() });

  writeFields(deps, file, { verified: events });
}

/**
 * Whether the plan-root log already carries an entry with the given
 * leading bold word (the closed entry vocabulary). A missing log has
 * no entries.
 */
export function logHasEntry(fs: FsPort, word: string): boolean {
  if (!fs.exists(LOG_FILE)) return false;
  const entry = new RegExp(`^[*-]\\s+\\*\\*${word}\\*\\*`);
  return fs.read(LOG_FILE).split("\n").some((line) => entry.test(line));
}

/**
 * Prepend an entry to the plan-root log, newest first: under today's
 * date heading when the log already groups by it, in a new date group
 * above the existing ones otherwise. The log body is edited in place;
 * the reserved log carries no frontmatter and gets no `generated`
 * stamp (that family is for plan and task documents).
 */
export function prependLogEntry(deps: WriteDeps, word: string, text: string): void {
  const date = deps.now().slice(0, 10);
  const entry = `* **${word}**: ${text}`;
  const lines = deps.fs.read(LOG_FILE).split("\n");

  const firstHeading = lines.findIndex((line) => /^##\s+\d{4}-\d{2}-\d{2}\s*$/.test(line));
  if (firstHeading === -1) {
    lines.push("", `## ${date}`, entry);
  } else if (lines[firstHeading].trim() === `## ${date}`) {
    lines.splice(firstHeading + 1, 0, entry);
  } else {
    lines.splice(firstHeading, 0, `## ${date}`, entry, "");
  }

  const body = lines.join("\n");
  deps.fs.write(LOG_FILE, body.endsWith("\n") ? body : `${body}\n`);
}
