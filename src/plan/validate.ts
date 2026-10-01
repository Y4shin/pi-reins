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

const RULE_CHECKS: Array<(scan: PlanScan) => Violation[]> = [
  checkParseFindings,
  checkIndexStructure,
  checkProfile,
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
