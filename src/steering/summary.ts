/**
 * The steering summary composer: the minimal measured variant of the
 * context-tail steering summary. Content is derived fresh from the
 * ephemeral state and a plan-directory scan (derived state is
 * recomputed, never persisted); the composer never touches disk.
 */

import type { PlanScan } from "../plan/discover.js";
import type { ReinsState } from "../state.js";

/** The invariant first line: alignment and the material-change boundary. */
const INVARIANT_HEADER =
  "[pi-reins] Stay within the agreed execution contract; material plan changes require the user.";

/** Collapse any whitespace runs so a field fits one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Compose the steering summary for one injection: the invariant header,
 * the contract's goal, and the gate state. Grows with the summary's
 * required content lines (counts, active work, blocked, latest
 * progress, progress-recording instruction), never exact-string bound.
 */
export function composeSummary(state: ReinsState, scan: PlanScan): string {
  const lines = [INVARIANT_HEADER];
  const goal = scan.plan?.frontmatter.goal;
  lines.push(
    `Goal: ${typeof goal === "string" && goal.trim() !== "" ? oneLine(goal) : "(no goal)"}`,
  );
  lines.push(`Gate: ${state.phase}`);
  return lines.join("\n");
}
