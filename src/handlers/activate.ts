/**
 * The activation flow behind `/reins-activate`.
 *
 * Activation is the user-controlled transition from a proposed plan to
 * an active execution contract (plan.md 1.2): the command previews what
 * is about to run (goal plus task summary), requires an explicit
 * confirmation, and on confirm flips the plan's executionStatus,
 * enters executing, and records the session entry. Declining changes
 * nothing durable.
 *
 * The flow is fail-closed: without an attached proposed contract, or
 * without an interactive UI to confirm with, it refuses instead of
 * acting.
 *
 * `deps.fs` must be rooted at the plan directory (the registration
 * shell roots it there via the wiring options; the harness matches).
 */

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir, type PlanScan } from "../plan/discover.js";
import {
  appendVerifiedEvent,
  logHasEntry,
  prependLogEntry,
  writeFields,
} from "../plan/write.js";
import { transition, type ReinsPhase, type ReinsState } from "../state.js";
import { requireUi } from "../ui/dialogs.js";

/** The custom type of the private session entry recording the activation. */
export const ACTIVATED_ENTRY_TYPE = "reins-activated";

/** The command's report surface: outcome plus the human-readable report. */
export interface ActivateResult {
  ok: boolean;
  /** The phase entered: executing on success. Undefined when refused or declined. */
  phase?: ReinsPhase;
  /** Human-readable report, as surfaced to the user. */
  report: string;
}

export async function activate(
  deps: ReinsDeps,
  state: ReinsState,
): Promise<{ state: ReinsState; result: ActivateResult }> {
  if (state.phase === "detached" || state.planDir === undefined) {
    return refuse(
      deps,
      state,
      "reins-activate: no contract is attached; run /reins-attach <path> first.",
    );
  }
  if (state.phase !== "attached") {
    return refuse(
      deps,
      state,
      "reins-activate: the contract is already active; there is nothing to activate.",
    );
  }
  if (!requireUi(deps, "Activation")) {
    return refuse(
      deps,
      state,
      "reins-activate: refused because no interactive UI is available to confirm the activation.",
    );
  }

  const planDir = state.planDir;
  const scan = discoverPlanDir(deps.fs, planDir);
  if (!scan.plan) {
    return refuse(
      deps,
      state,
      `reins-activate: the plan document in ${planDir} could not be read; re-attach the plan directory.`,
    );
  }

  const confirmed = await deps.ui.confirm("Activate execution contract", previewMessage(scan));
  if (!confirmed) {
    const report = "Activation declined; the plan remains proposed and nothing was changed.";
    deps.ui.notify(report, "info");
    return { state, result: { ok: false, report } };
  }

  writeFields(deps, scan.plan.file, { executionStatus: "active" });
  // The log records contract changes from creation onward; an external
  // planner may not have written a Creation entry, so activation
  // ensures one exists rather than leaving the history headless.
  if (!logHasEntry(deps.fs, "Creation")) {
    prependLogEntry(deps, "Creation", "Initial proposed plan.");
  }
  prependLogEntry(deps, "Activation", "Plan activated by the user; execution begins.");
  // The verified event and the Activation entry are written together
  // by this writer (fs-contract, Generated and Verified).
  appendVerifiedEvent(deps, scan.plan.file, deps.actor);
  const nextState = transition(state, "executing");
  deps.session.appendEntry(ACTIVATED_ENTRY_TYPE, { planDir, phase: nextState.phase });

  const report =
    `Activated execution contract: ${goalOf(scan)} (${scan.tasks.length} tasks). ` +
    `Executing ${planDir}.`;
  deps.ui.notify(report, "info");
  return { state: nextState, result: { ok: true, phase: nextState.phase, report } };
}

/** The confirmation dialog's preview: goal plus per-task summary. */
function previewMessage(scan: PlanScan): string {
  const tasks = scan.tasks.map((task) => {
    const label =
      typeof task.frontmatter.title === "string"
        ? task.frontmatter.title
        : typeof task.frontmatter.id === "string"
          ? task.frontmatter.id
          : task.file;
    const status =
      typeof task.frontmatter.executionStatus === "string"
        ? task.frontmatter.executionStatus
        : "unknown";
    return `- ${label} (${status})`;
  });
  return [
    "Activate this plan as the execution contract?",
    "",
    `Goal: ${goalOf(scan)}`,
    "",
    `Tasks (${scan.tasks.length}):`,
    ...tasks,
    "",
    "Activation is user-controlled: execution begins and material changes will require your involvement.",
  ].join("\n");
}

function goalOf(scan: PlanScan): string {
  const goal = scan.plan?.frontmatter.goal;
  return typeof goal === "string" ? goal : "(no goal)";
}

function refuse(
  deps: ReinsDeps,
  state: ReinsState,
  report: string,
): { state: ReinsState; result: ActivateResult } {
  deps.ui.notify(report, "error");
  return { state, result: { ok: false, report } };
}
