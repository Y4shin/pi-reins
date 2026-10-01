/**
 * Plan-directory discovery.
 *
 * Walks a plan directory once per invocation (no caching, ever) and
 * returns a `PlanScan`: the plan document, task documents, change
 * proposal documents, the bundle index and log, supporting files, and
 * per-file parse findings. Categorization is by frontmatter type; the
 * reserved filenames (index.md, log.md) keep their OKF meaning at
 * every level and never serve as task, phase, or plan documents.
 */

import type { FsPort } from "../deps.js";
import {
  extractBindingSections,
  parseDoc,
  type IndexDocument,
  type LogDocument,
  type ParseFinding,
  type PlanDocument,
  type ProposalDocument,
  type TaskDocument,
} from "./parse.js";

export interface PlanScan {
  /** The plan directory root, as passed in. */
  root: string;
  /** The root plan.md document, when present and parseable. */
  plan?: PlanDocument;
  /** Documents with `type: Task`, sorted by file path. */
  tasks: TaskDocument[];
  /** Documents with `type: Change Proposal`, sorted by file path. */
  proposals: ProposalDocument[];
  /** The root index.md bundle index, when present. */
  index?: IndexDocument;
  /** The root log.md change log, when present. */
  log?: LogDocument;
  /** Every other file, as plan-relative paths (sorted). */
  supporting: string[];
  /** All parse findings, accumulated per file. */
  findings: ParseFinding[];
}

export function discoverPlanDir(fs: FsPort, root: string): PlanScan {
  const scan: PlanScan = {
    root,
    tasks: [],
    proposals: [],
    supporting: [],
    findings: [],
  };

  if (!fs.exists("")) {
    scan.findings.push({
      file: "",
      rule: "missing-plan-root",
      message: `the plan directory does not exist: ${root}`,
    });
    return scan;
  }

  for (const file of fs.list()) {
    if (!file.endsWith(".md")) {
      scan.supporting.push(file);
      continue;
    }

    let text: string;
    try {
      text = fs.read(file);
    } catch (err) {
      scan.findings.push({
        file,
        rule: "unreadable-file",
        message: `could not read file: ${(err as Error).message}`,
      });
      continue;
    }

    // The root plan document is fixed by filename, not by type.
    if (file === "plan.md") {
      const { doc, findings } = parseDoc(text, file);
      scan.findings.push(...findings);
      if (doc !== null) {
        scan.plan = doc as PlanDocument;
      } else {
        scan.supporting.push(file);
      }
      continue;
    }

    // Reserved filenames keep their OKF meaning at every level: they
    // never serve as task, phase, or plan documents and are exempt
    // from the non-reserved type rule.
    const base = file.slice(file.lastIndexOf("/") + 1);
    if (base === "index.md" || base === "log.md") {
      const { doc, findings } = parseDoc(text, file, { frontmatterOptional: true });
      scan.findings.push(...findings);
      if (file === "index.md" && doc !== null) {
        scan.index = doc as IndexDocument;
      } else if (file === "log.md" && doc !== null) {
        scan.log = doc as LogDocument;
      } else {
        scan.supporting.push(file);
      }
      continue;
    }

    const { doc, findings } = parseDoc(text, file);
    scan.findings.push(...findings);

    if (doc === null) {
      scan.supporting.push(file);
      continue;
    }

    const type = doc.frontmatter.type;
    if (type === "Task") {
      const extraction = extractBindingSections(doc.body);
      scan.findings.push(...extraction.findings.map((f) => ({ ...f, file })));
      scan.tasks.push({ ...doc, binding: extraction.binding });
      continue;
    }

    if (type === "Change Proposal") {
      scan.proposals.push(doc as ProposalDocument);
      continue;
    }

    // Supporting context (any other type, or a typeless doc already
    // flagged above). The plugin may structurally ignore it.
    scan.supporting.push(file);
  }

  scan.tasks.sort((a, b) => a.file.localeCompare(b.file));
  scan.proposals.sort((a, b) => a.file.localeCompare(b.file));
  scan.supporting.sort();

  if (scan.plan === undefined) {
    scan.findings.push({
      file: "plan.md",
      rule: "missing-plan-document",
      message: "every plan directory must contain a plan.md plan document",
    });
  }
  return scan;
}
