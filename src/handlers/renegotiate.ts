/**
 * Renegotiation triggers and the gate-1 proposal session.
 *
 * Triggers (arch spec, ticket 9): current-work bearing (a non-deferred
 * proposal bearing on an in_progress task), imminent-work entanglement
 * (at task start, a non-deferred proposal bearing on that task),
 * exhaustion (no agreed work left to take up, at least one non-deferred
 * proposal pending), and initiative (the reins_renegotiate tool and the
 * /reins-renegotiate command). `shouldOpenSession` evaluates the
 * trigger conditions; `openRenegotiationSession` runs the gate itself.
 *
 * Deferred proposals never trigger a session on their own: they stay in
 * the pending set (and appear in any sweep) but every trigger condition
 * filters them out. Deliberate opening (initiative) is the one way to
 * reach a deferred-only set.
 */

import type { PlanScan } from "../plan/discover.js";
import type { ProposalDocument } from "../plan/parse.js";
import { proposalStore } from "../plan/proposals.js";
import type { ReinsState } from "../state.js";

/** What caused the trigger evaluation. */
export type SessionCause =
  /** A proposal bears on the task currently being worked on. */
  | { kind: "current-work" }
  /** Work is about to start on a task entangled with a pending proposal. */
  | { kind: "task-start"; taskId: string }
  /** Eligible agreed work is exhausted while the pending set is non-empty. */
  | { kind: "exhaustion" }
  /** Deliberate opening by the agent (tool) or the user (command). */
  | { kind: "initiative" };

/** Proposals that can trigger a session: recorded and not deferred. */
function triggering(proposal: ProposalDocument): boolean {
  return proposal.frontmatter.deferred !== true;
}

/**
 * Whether the given cause opens a renegotiation session. Only an
 * active, executing contract can enter the gate; deferred proposals
 * never satisfy a trigger condition.
 */
export function shouldOpenSession(state: ReinsState, scan: PlanScan, cause: SessionCause): boolean {
  if (state.phase !== "executing" || state.planDir === undefined) return false;
  const store = proposalStore(scan);

  switch (cause.kind) {
    case "initiative":
      return true;
    case "task-start":
      return store.bearingOn(cause.taskId).some(triggering);
    case "current-work": {
      const active = scan.tasks.filter(
        (task) => task.frontmatter.executionStatus === "in_progress",
      );
      return active.some((task) => {
        const id = task.frontmatter.id;
        return typeof id === "string" && store.bearingOn(id).some(triggering);
      });
    }
    case "exhaustion": {
      // Eligible agreed work is exhausted when nothing can be taken up:
      // no pending or blocked task (startable), and none in flight. An
      // in_progress task is current work, not exhausted work.
      const startable = scan.tasks.some((task) => {
        const status = task.frontmatter.executionStatus;
        return status === "pending" || status === "blocked" || status === "in_progress";
      });
      return !startable && store.pending().some(triggering);
    }
  }
}
