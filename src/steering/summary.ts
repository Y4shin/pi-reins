/**
 * The steering summary composer: the minimal measured variant of the
 * context-tail steering summary (invariant header, goal, counts, active
 * work, blocked, gate state, latest progress line, progress-recording
 * instruction). Content is derived fresh from the ephemeral state and a
 * plan-directory scan (derived state is recomputed, never persisted);
 * the composer never touches disk.
 */

import type { PlanScan } from "../plan/discover.js";
import type { TaskDocument } from "../plan/parse.js";
import { latestProgress } from "../ui/widget.js";
import type { ReinsState } from "../state.js";

/** The invariant first line: alignment and the material-change boundary. */
const INVARIANT_HEADER =
  "[pi-reins] Stay within the agreed execution contract; material plan changes require the user.";

/** Collapse any whitespace runs so a field fits one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function idOf(task: TaskDocument): string {
  return String(task.frontmatter.id ?? task.file);
}

/**
 * Compose the steering summary for one injection. Required content
 * lines only, joined one per line; never exact-string bound beyond
 * those lines.
 */
export function composeSummary(state: ReinsState, scan: PlanScan): string {
  const lines = [INVARIANT_HEADER];

  const goal = scan.plan?.frontmatter.goal;
  lines.push(
    `Goal: ${typeof goal === "string" && goal.trim() !== "" ? oneLine(goal) : "(no goal)"}`,
  );

  const byStatus = (status: string): TaskDocument[] =>
    scan.tasks.filter((task) => task.frontmatter.executionStatus === status);
  const active = byStatus("in_progress");
  const blocked = byStatus("blocked");
  const done = byStatus("done").length;
  lines.push(
    `Tasks: ${done}/${scan.tasks.length} done; ` +
      `active: ${active.map(idOf).join(", ") || "none"}; ` +
      `blocked: ${blocked.map(idOf).join(", ") || "none"}.`,
  );

  lines.push(`Gate: ${state.phase}`);

  const now = latestProgress(scan);
  if (now !== undefined) {
    lines.push(`Now: ${now.note}`);
  }

  lines.push("Record each meaningful step with reins_progress.");
  return lines.join("\n");
}
