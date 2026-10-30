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
import { dumpDocument, splitFrontmatter, type BindingSections, type FrontmatterData } from "./parse.js";

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
 * override. `opts.body` replaces the body (the plan-editing tools
 * rewrite binding sections this way); `opts.remove` deletes fields.
 * Writing a document whose frontmatter does not parse throws (callers
 * surface that as a tool error); parsing a plan directory never does.
 */
export function writeFields(
  deps: WriteDeps,
  file: string,
  fields: FrontmatterData,
  opts: { remove?: string[]; body?: string } = {},
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

  deps.fs.write(file, dumpDocument(data, opts.body ?? split.body));
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

/** Normalize an H2 heading for section matching, as the parsers do. */
function normalizeHeading(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Trim blank lines from both ends of a line buffer. */
function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

/**
 * Rewrite the three binding sections of a task body: each named
 * section's content is replaced wholesale, other sections and any text
 * outside the `# Task` block survive verbatim (outer blank lines of a
 * section are normalized; internal content is preserved). A section
 * missing from the body is appended, in Description, Acceptance
 * Criteria, Constraints order after the existing sections. A body
 * without a `# Task` H1 is returned unchanged (callers validated the
 * document before rewriting it).
 */
export function rewriteBindingSections(body: string, updates: Partial<BindingSections>): string {
  if (Object.keys(updates).length === 0) return body;
  const lines = body.split("\n");

  let taskStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^# Task\s*$/.test(lines[i])) {
      taskStart = i;
      break;
    }
  }
  if (taskStart === -1) return body;
  let taskEnd = lines.length;
  for (let i = taskStart + 1; i < lines.length; i++) {
    if (/^#\s/.test(lines[i])) {
      taskEnd = i;
      break;
    }
  }

  const KEY_OF: Record<string, keyof BindingSections> = {
    description: "description",
    "acceptance criteria": "acceptanceCriteria",
    constraints: "constraints",
  };
  interface Section {
    headingLine: string;
    key?: keyof BindingSections;
    content: string[];
  }
  const sections: Section[] = [];
  let preamble: string[] = [];
  for (let i = taskStart + 1; i < taskEnd; i++) {
    const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const name = normalizeHeading(h2[1]);
      sections.push({ headingLine: lines[i], key: KEY_OF[name], content: [] });
    } else if (sections.length === 0) {
      preamble.push(lines[i]);
    } else {
      sections[sections.length - 1].content.push(lines[i]);
    }
  }

  // Sections the body lacks but an update names: appended after the
  // existing ones, in the binding-section order.
  const present = new Set(sections.map((section) => section.key));
  const HEADING_OF: Record<keyof BindingSections, string> = {
    description: "## Description",
    acceptanceCriteria: "## Acceptance Criteria",
    constraints: "## Constraints",
  };
  for (const key of ["description", "acceptanceCriteria", "constraints"] as const) {
    if (updates[key] !== undefined && !present.has(key)) {
      sections.push({ headingLine: HEADING_OF[key], key, content: [] });
    }
  }

  const out: string[] = [lines[taskStart], ...preamble];
  for (const section of sections) {
    const update = section.key !== undefined ? updates[section.key] : undefined;
    const content = trimBlankLines((update ?? section.content.join("\n")).split("\n"));
    const previousIsBlank = out.length > 0 && out[out.length - 1].trim() === "";
    if (!previousIsBlank) out.push("");
    out.push(section.headingLine, ...content);
  }
  out.push(...lines.slice(taskEnd));

  let result = out.join("\n");
  if (body.endsWith("\n") && !result.endsWith("\n")) result += "\n";
  return result;
}
