/**
 * The widget: the plugin's single status surface.
 *
 * `renderWidget` is the widget surface other tickets call on state
 * changes; it derives the lines from the ephemeral state and a fresh
 * plan scan (derived state is recomputed, never persisted) and pushes
 * them to `ctx.ui.setWidget`. Phase 1 activation renders the minimal
 * variant: the goal and the done/total task counts; later tickets
 * extend the lines (active work, Now line, blocked list, gate state,
 * proposal counts).
 */

import type { ReinsDeps } from "../deps.js";
import type { PlanScan } from "../plan/discover.js";
import type { ReinsState } from "../state.js";

/** The widget key, per the architecture spec. */
export const WIDGET_KEY = "pi-reins";

export function renderWidget(deps: ReinsDeps, state: ReinsState, scan: PlanScan): void {
  deps.ui.setWidget(WIDGET_KEY, widgetLines(state, scan));
}

/** The minimal Phase 1 activation widget: goal plus done/total counts. */
function widgetLines(_state: ReinsState, scan: PlanScan): string[] {
  const goal = scan.plan?.frontmatter.goal;
  const goalText = typeof goal === "string" ? goal : "(no goal)";
  const total = scan.tasks.length;
  const done = scan.tasks.filter((task) => task.frontmatter.executionStatus === "done").length;
  return [`Goal: ${goalText}`, `Tasks: ${done}/${total} done`];
}
