/**
 * The attach flow behind `/reins-attach <path>`.
 *
 * Validates the plan directory against the execution-plan contract,
 * reports the result, and binds on pass: `attached` for a proposed
 * plan, `executing` for a plan whose executionStatus is already
 * active. The plan path is recorded as a private session entry so a
 * fresh session can re-attach. A failing attach produces the precise
 * rejection report naming every violated rule; the plugin never
 * repairs or generates plan content.
 *
 * `deps.fs` must be rooted at the plan directory (the registration
 * shell roots it there via the wiring options; the harness matches).
 */

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir } from "../plan/discover.js";
import { formatRejection, validatePlan, type Violation } from "../plan/validate.js";
import { transition, type ReinsPhase, type ReinsState } from "../state.js";

/** The command's report surface: outcome plus every violation on failure. */
export interface AttachResult {
  ok: boolean;
  /** The bound plan directory (absolute path), when attached. */
  planDir?: string;
  /** The phase entered: attached or executing. Undefined when refused. */
  phase?: ReinsPhase;
  /** Every violated rule, empty when the attach passed or was refused on other grounds. */
  violations: Violation[];
  /** Human-readable report, as surfaced to the user. */
  report: string;
}

/** The custom type of the private session entry recording the attach. */
export const ATTACHED_ENTRY_TYPE = "reins-attached";

export function attach(
  deps: ReinsDeps,
  state: ReinsState,
  planPath: string | undefined,
): { state: ReinsState; result: AttachResult } {
  if (planPath === undefined || planPath.trim() === "") {
    return refuse(deps, state, "reins-attach: no plan directory given. Usage: /reins-attach <path>");
  }

  if (state.phase !== "detached") {
    return refuse(
      deps,
      state,
      `reins-attach: a contract is already attached (${state.planDir ?? "unknown"}); ` +
        "start a fresh session to attach a different plan.",
    );
  }

  const scan = discoverPlanDir(deps.fs, planPath);
  const violations = validatePlan(scan);
  if (violations.length > 0) {
    const result: AttachResult = {
      ok: false,
      violations,
      report: formatRejection(planPath, violations),
    };
    deps.ui.notify(result.report, "error");
    return { state, result };
  }

  const status = scan.plan?.frontmatter.executionStatus;
  if (status === "completed") {
    return refuse(
      deps,
      state,
      `reins-attach: the plan at ${planPath} is already completed; ` +
        "there is nothing left to execute.",
    );
  }

  const phase: ReinsPhase = status === "active" ? "executing" : "attached";
  const nextState: ReinsState = { ...transition(state, phase), planDir: planPath };
  deps.session.appendEntry(ATTACHED_ENTRY_TYPE, { planDir: planPath, phase });

  const goal = scan.plan?.frontmatter.goal;
  const goalText = typeof goal === "string" ? goal : "(no goal)";
  const report =
    phase === "executing"
      ? `Attached active execution contract: ${goalText} (${scan.tasks.length} tasks). Executing ${planPath}.`
      : `Attached execution contract: ${goalText} (${scan.tasks.length} tasks). ` +
        "The plan is proposed; run /reins-activate to begin execution.";
  const result: AttachResult = { ok: true, planDir: planPath, phase, violations: [], report };
  deps.ui.notify(result.report, "info");
  return { state: nextState, result };
}

function refuse(
  deps: ReinsDeps,
  state: ReinsState,
  report: string,
): { state: ReinsState; result: AttachResult } {
  deps.ui.notify(report, "error");
  const result: AttachResult = { ok: false, violations: [], report };
  return { state, result };
}
