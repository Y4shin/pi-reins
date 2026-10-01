/**
 * The widget: the plugin's single status surface.
 *
 * `renderWidget` is the widget surface other tickets call on state
 * changes; it derives the lines from the ephemeral state and a fresh
 * plan scan (derived state is recomputed, never persisted) and pushes
 * them to `ctx.ui.setWidget`. Content per the architecture spec: goal,
 * active work, the Now line (latest progressLog entry), done/total
 * counts, blocked list, gate state. Empty sections are omitted;
 * proposal counts arrive with the change-proposals ticket.
 */

import type { ReinsDeps } from "../deps.js";
import type { PlanScan } from "../plan/discover.js";
import { proposalStore } from "../plan/proposals.js";
import type { TaskDocument } from "../plan/parse.js";
import type { ReinsState } from "../state.js";

/** The widget key, per the architecture spec. */
export const WIDGET_KEY = "pi-reins";

export function renderWidget(deps: ReinsDeps, state: ReinsState, scan: PlanScan): void {
  deps.ui.setWidget(WIDGET_KEY, widgetLines(state, scan));
}

/** A progressLog entry as the Now line reads it. */
export interface WidgetNow {
  at: string;
  /** The note, whitespace-collapsed to fit one line. */
  note: string;
  taskId: string;
}

/** Collapse any whitespace runs so an entry fits on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function idOf(task: TaskDocument): string {
  return String(task.frontmatter.id ?? task.file);
}

/**
 * The latest progressLog entry across all tasks. Ties on `at` resolve
 * to the entry appended later (document order), so a frozen clock still
 * shows the newest note. Entries never leave the task they were
 * recorded on; this is the derived Now line only.
 */
export function latestProgress(scan: PlanScan): WidgetNow | undefined {
  let latest: WidgetNow | undefined;
  for (const task of scan.tasks) {
    const log = task.frontmatter.progressLog;
    if (!Array.isArray(log)) continue;
    const taskId = idOf(task);
    for (const entry of log as unknown[]) {
      const record = entry as { at?: unknown; note?: unknown };
      if (typeof record?.at !== "string" || typeof record?.note !== "string") continue;
      if (latest === undefined || record.at >= latest.at) {
        latest = { at: record.at, note: oneLine(record.note), taskId };
      }
    }
  }
  return latest;
}

function describeBlocked(task: TaskDocument): string {
  const reason = task.frontmatter.blockedReason;
  return typeof reason === "string" && reason.trim() !== "" ? `${idOf(task)} (${oneLine(reason)})` : idOf(task);
}

function widgetLines(state: ReinsState, scan: PlanScan): string[] {
  const goal = scan.plan?.frontmatter.goal;
  const goalText = typeof goal === "string" ? goal : "(no goal)";
  const lines = [`Goal: ${goalText}`];

  const byStatus = (status: string): TaskDocument[] =>
    scan.tasks.filter((task) => task.frontmatter.executionStatus === status);

  const active = byStatus("in_progress");
  if (active.length > 0) {
    lines.push(`Active: ${active.map(idOf).join(", ")}`);
  }
  const now = latestProgress(scan);
  if (now !== undefined) {
    lines.push(`Now: ${now.note}`);
  }
  lines.push(`Tasks: ${byStatus("done").length}/${scan.tasks.length} done`);
  const blocked = byStatus("blocked");
  if (blocked.length > 0) {
    lines.push(`Blocked: ${blocked.map(describeBlocked).join(", ")}`);
  }
  lines.push(`Gate: ${state.phase}`);
  // Pending and deferred proposal counts, per the architecture spec's
  // widget surface. Deferred proposals stay in the pending set and are
  // counted apart.
  const proposals = proposalStore(scan);
  const pending = proposals.pending().length;
  if (pending > 0) {
    const deferred = proposals.deferred().length;
    lines.push(`Proposals: ${pending} pending` + (deferred > 0 ? `, ${deferred} deferred` : ""));
  }
  return lines;
}
