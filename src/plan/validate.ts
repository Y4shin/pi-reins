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

const RULE_CHECKS: Array<(scan: PlanScan) => Violation[]> = [checkParseFindings];

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
