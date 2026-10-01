/**
 * Document parsers for the plan directory.
 *
 * Per the execution-plan directory contract: YAML frontmatter plus the
 * binding task body structure (three H2 sections under a literal
 * `# Task` H1). This is not a general Markdown parser: only frontmatter
 * and H1/H2 heading extraction. Content problems are surfaced as
 * `ParseFinding`s, never thrown.
 */

import YAML from "yaml";

export interface ParseFinding {
  /** Plan-relative file path the finding belongs to. */
  file: string;
  /** Machine-readable rule identifier. */
  rule: string;
  /** Human-readable explanation. */
  message: string;
}

/** Any parsed document: frontmatter mapping plus the verbatim body. */
export interface FrontmatterDoc {
  file: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface PlanDocument extends FrontmatterDoc {}

export interface ProposalDocument extends FrontmatterDoc {}

export interface IndexDocument extends FrontmatterDoc {}

export interface LogDocument extends FrontmatterDoc {}

/** The three binding sections of a task body. Absent means missing. */
export interface BindingSections {
  description?: string;
  acceptanceCriteria?: string;
  constraints?: string;
}

export interface TaskDocument extends FrontmatterDoc {
  binding: BindingSections;
}

const FENCE = "---";
const BINDING_NAMES = ["Description", "Acceptance Criteria", "Constraints"] as const;

export type FrontmatterData = Record<string, unknown>;

interface FrontmatterSplit {
  frontmatterText: string | null;
  body: string;
  error?: string;
}

/**
 * Split raw text into frontmatter text and body. Never throws: a
 * missing opening fence means no frontmatter; a missing closing fence
 * is an error.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].trim() !== FENCE) {
    return { frontmatterText: null, body: text };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) {
      return {
        frontmatterText: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { frontmatterText: null, body: text, error: "unterminated frontmatter (no closing '---')" };
}

/** Serialize a document back to markdown with frontmatter. */
export function dumpDocument(data: FrontmatterData, body: string): string {
  const block = YAML.stringify(data, {
    sortMapEntries: false,
    indentSeq: false,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
  }).replace(/\n+$/, "");
  return `${FENCE}\n${block}\n${FENCE}\n${body}`;
}

export interface ParsedDoc {
  doc: FrontmatterDoc | null;
  findings: ParseFinding[];
}

/**
 * Parse one markdown document. Returns a doc whenever the frontmatter
 * itself is parseable, even when the `type` key is missing or empty
 * (surfaced as a `missing-type` finding). Returns a null doc only when
 * the frontmatter cannot be parsed at all.
 *
 * `frontmatterOptional` marks reserved files (index.md, log.md), which
 * carry no `type` and may legitimately have no frontmatter at all.
 */
export function parseDoc(
  text: string,
  file: string,
  opts: { frontmatterOptional?: boolean } = {},
): ParsedDoc {
  const findings: ParseFinding[] = [];
  const split = splitFrontmatter(text);

  if (split.error) {
    findings.push({ file, rule: "unparseable-frontmatter", message: split.error });
    return { doc: null, findings };
  }

  let frontmatter: FrontmatterData = {};
  if (split.frontmatterText !== null) {
    let parsed: unknown;
    try {
      parsed = YAML.parse(split.frontmatterText);
    } catch (err) {
      findings.push({
        file,
        rule: "unparseable-frontmatter",
        message: `frontmatter YAML does not parse: ${(err as Error).message}`,
      });
      return { doc: null, findings };
    }
    if (parsed === null || parsed === undefined) {
      frontmatter = {};
    } else if (typeof parsed !== "object" || Array.isArray(parsed)) {
      findings.push({
        file,
        rule: "frontmatter-not-mapping",
        message: "frontmatter must be a mapping of keys to values",
      });
      return { doc: null, findings };
    } else {
      frontmatter = parsed as FrontmatterData;
    }
  } else if (!opts.frontmatterOptional) {
    findings.push({
      file,
      rule: "missing-frontmatter",
      message: "document has no frontmatter; a non-reserved document requires a type",
    });
  }

  const type = frontmatter.type;
  if (!opts.frontmatterOptional && (typeof type !== "string" || type.trim() === "")) {
    findings.push({
      file,
      rule: "missing-type",
      message: "frontmatter must declare a non-empty type",
    });
  }

  return { doc: { file, frontmatter, body: split.body }, findings };
}

export interface BindingExtraction {
  binding: BindingSections;
  findings: Array<Omit<ParseFinding, "file">>;
}

/**
 * Extract the three binding sections from a task body. The body must
 * carry a literal `# Task` H1; inside it, `## Description`,
 * `## Acceptance Criteria`, and `## Constraints` delimit the sections.
 * Deeper headings belong to their section; anything after the next H1
 * is outside the task block.
 */
export function extractBindingSections(body: string): BindingExtraction {
  const findings: Array<Omit<ParseFinding, "file">> = [];
  const lines = body.split("\n");

  let taskStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^# Task\s*$/.test(lines[i])) {
      taskStart = i;
      break;
    }
  }
  if (taskStart === -1) {
    findings.push({
      rule: "missing-task-heading",
      message: "task body must carry a literal '# Task' H1 heading",
    });
    return { binding: {}, findings };
  }

  // The task block ends at the next H1 after the `# Task` heading.
  let taskEnd = lines.length;
  for (let i = taskStart + 1; i < lines.length; i++) {
    if (/^#\s/.test(lines[i])) {
      taskEnd = i;
      break;
    }
  }

  const binding: BindingSections = {};
  const assigned = new Set<string>();
  let current: (typeof BINDING_NAMES)[number] | null = null;
  let buffer: string[] = [];

  const flush = (): void => {
    if (current !== null && !assigned.has(current)) {
      binding[keyOf(current)] = trimBlank(buffer).join("\n");
      assigned.add(current);
    }
    buffer = [];
  };

  for (let i = taskStart + 1; i < taskEnd; i++) {
    const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      const name = h2[1];
      if ((BINDING_NAMES as readonly string[]).includes(name)) {
        current = name as (typeof BINDING_NAMES)[number];
      } else {
        // An unknown direct subheading is a validation error, not
        // advisory prose (fs-contract, Tasks): surfaced here where the
        // task block is parsed, reported by attach-time validation.
        findings.push({
          rule: "unknown-task-subheading",
          message: `"## ${name}" under # Task is not a binding section; only Description, Acceptance Criteria, and Constraints may appear directly under # Task`,
        });
        current = null;
      }
    } else {
      buffer.push(lines[i]);
    }
  }
  flush();

  return { binding, findings };
}

function keyOf(name: "Description" | "Acceptance Criteria" | "Constraints") {
  switch (name) {
    case "Description":
      return "description";
    case "Acceptance Criteria":
      return "acceptanceCriteria";
    case "Constraints":
      return "constraints";
  }
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}
