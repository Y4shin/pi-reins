/**
 * Attach-time validation of a plan directory against the
 * execution-plan contract.
 *
 * `validatePlan` returns EVERY violation, not only the first: the
 * rejection report must name every violated rule so a failing plan can
 * be fixed without guessing. The rule checks are organized per class
 * (parse findings, OKF profile and required metadata, binding
 * sections, executionStatus vocabularies, id uniqueness, log
 * structure); later tickets extend the list (the change-proposals
 * ticket adds proposal well-formedness).
 *
 * Validation never repairs or generates plan content, never rejects
 * unrecognized frontmatter keys (OKF permits additional keys), and
 * never validates Phase 2+ structures (dependencies, phases, budgets).
 */

import type { PlanScan } from "./discover.js";
import type { BindingSections } from "./parse.js";

/** One violated rule, located by plan-relative file path. */
export interface Violation {
  /** Plan-relative file path, or "" for directory-level rules. */
  file: string;
  /** Machine-readable rule identifier. */
  rule: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * Parse findings (unparseable frontmatter, missing type, missing task
 * heading, missing plan document, and the rest) are violations of the
 * upstream hard rules; aggregate them into the report.
 */
function checkParseFindings(scan: PlanScan): Violation[] {
  return scan.findings.map((finding) => ({ ...finding }));
}

/**
 * OKF index structure (upstream §8): the root index.md carries no
 * frontmatter except the okf_version declaration and no schema fields.
 */
function checkIndexStructure(scan: PlanScan): Violation[] {
  if (!scan.index) return [];
  const extra = Object.keys(scan.index.frontmatter).filter((key) => key !== "okf_version");
  if (extra.length === 0) return [];
  return [
    {
      file: scan.index.file,
      rule: "index-frontmatter-keys",
      message:
        "index.md carries no frontmatter except the okf_version declaration " +
        `(found: ${extra.join(", ")})`,
    },
  ];
}

/**
 * OKF 0.2 profile rules: the root index.md and log.md are mandatory,
 * okf_version is pinned to "0.2", and the plan document carries the
 * format's required frontmatter (type, id, schemaVersion, goal).
 * Unrecognized frontmatter keys stay permitted everywhere else.
 */
function checkProfile(scan: PlanScan): Violation[] {
  const violations: Violation[] = [];
  if (!scan.index) {
    violations.push({
      file: "index.md",
      rule: "missing-reserved-file",
      message: "the plan root must contain an index.md bundle index",
    });
  } else {
    const okfVersion = scan.index.frontmatter.okf_version;
    if (okfVersion !== "0.2") {
      violations.push({
        file: scan.index.file,
        rule: "okf-version",
        message: `index.md must declare okf_version: "0.2" (got: ${JSON.stringify(okfVersion) ?? "nothing"})`,
      });
    }
  }
  if (!scan.log) {
    violations.push({
      file: "log.md",
      rule: "missing-reserved-file",
      message: "the plan root must contain a log.md change log",
    });
  }
  violations.push(...checkPlanMetadata(scan));
  return violations;
}

const REQUIRED_PLAN_FIELDS = ["id", "schemaVersion", "goal"] as const;

function checkPlanMetadata(scan: PlanScan): Violation[] {
  const plan = scan.plan;
  if (!plan) return [];
  const violations: Violation[] = [];
  if (plan.frontmatter.type !== "Execution Plan") {
    violations.push({
      file: plan.file,
      rule: "plan-type",
      message: `plan.md must declare type: Execution Plan (got: ${JSON.stringify(plan.frontmatter.type) ?? "nothing"})`,
    });
  }
  for (const field of REQUIRED_PLAN_FIELDS) {
    if (plan.frontmatter[field] === undefined) {
      violations.push({
        file: plan.file,
        rule: "missing-required-field",
        message: `plan.md frontmatter must declare ${field}`,
      });
    }
  }
  return violations;
}

/** The three binding roles of a task body, in contract order. */
const BINDING_ROLES: ReadonlyArray<[keyof BindingSections, string]> = [
  ["description", "Description"],
  ["acceptanceCriteria", "Acceptance Criteria"],
  ["constraints", "Constraints"],
];

/**
 * Binding-section structure and roles: every task body carries all
 * three binding sections under the `# Task` H1. Unknown H2 subheadings
 * under `# Task` arrive as parse findings (unknown-task-subheading)
 * and are aggregated with the rest.
 */
function checkBindingSections(scan: PlanScan): Violation[] {
  const violations: Violation[] = [];
  for (const task of scan.tasks) {
    for (const [key, name] of BINDING_ROLES) {
      if (task.binding[key] === undefined) {
        violations.push({
          file: task.file,
          rule: "missing-binding-section",
          message: `task body is missing the required "## ${name}" binding section under # Task`,
        });
      }
    }
  }
  return violations;
}

/** executionStatus vocabularies, per the fs-contract. */
const PLAN_STATUSES = ["proposed", "active", "completed"];
const TASK_STATUSES = ["pending", "in_progress", "blocked", "done"];

/**
 * executionStatus vocabularies: the plan document uses the plan
 * vocabulary, task documents the task vocabulary. Missing or
 * out-of-vocabulary values violate the rule on either document kind.
 */
function checkStatusVocabularies(scan: PlanScan): Violation[] {
  const violations: Violation[] = [];
  if (scan.plan) {
    const status = scan.plan.frontmatter.executionStatus;
    if (typeof status !== "string" || !PLAN_STATUSES.includes(status)) {
      violations.push({
        file: scan.plan.file,
        rule: "execution-status-vocabulary",
        message: `plan executionStatus must be one of ${PLAN_STATUSES.join(", ")} (${describeValue(status)})`,
      });
    }
  }
  for (const task of scan.tasks) {
    const status = task.frontmatter.executionStatus;
    if (typeof status !== "string" || !TASK_STATUSES.includes(status)) {
      violations.push({
        file: task.file,
        rule: "execution-status-vocabulary",
        message: `task executionStatus must be one of ${TASK_STATUSES.join(", ")} (${describeValue(status)})`,
      });
    }
  }
  return violations;
}

function describeValue(value: unknown): string {
  return value === undefined ? "missing" : `got: ${JSON.stringify(value)}`;
}

/**
 * Id rules: task ids are required and unique within the plan (stable
 * semantic identity is the frontmatter id, never the file path).
 */
function checkIdUniqueness(scan: PlanScan): Violation[] {
  const violations: Violation[] = [];
  const filesById = new Map<string, string[]>();
  for (const task of scan.tasks) {
    const id = task.frontmatter.id;
    if (typeof id !== "string" || id.trim() === "") {
      violations.push({
        file: task.file,
        rule: "missing-task-id",
        message: "task documents must declare a non-empty id",
      });
      continue;
    }
    filesById.set(id, [...(filesById.get(id) ?? []), task.file]);
  }
  for (const [id, files] of filesById) {
    if (files.length > 1) {
      violations.push({
        file: files[0],
        rule: "duplicate-task-id",
        message: `task id "${id}" is declared by ${files.length} tasks: ${files.join(", ")}`,
      });
    }
  }
  return violations;
}

const RULE_CHECKS: Array<(scan: PlanScan) => Violation[]> = [
  checkParseFindings,
  checkIndexStructure,
  checkProfile,
  checkBindingSections,
  checkStatusVocabularies,
  checkIdUniqueness,
];

/** Validate a scan against the full execution-plan contract. */
export function validatePlan(scan: PlanScan): Violation[] {
  const violations: Violation[] = [];
  for (const check of RULE_CHECKS) {
    violations.push(...check(scan));
  }
  return violations;
}

/** Render the rejection report: every violation, with its rule. */
export function formatRejection(planDir: string, violations: Violation[]): string {
  const lines = violations.map(
    (v) => `- ${v.file === "" ? "(plan directory)" : v.file} [${v.rule}] ${v.message}`,
  );
  return [
    `Plan rejected: ${planDir} violates the execution-plan contract`,
    `(${violations.length} violation${violations.length === 1 ? "" : "s"}):`,
    ...lines,
  ].join("\n");
}
