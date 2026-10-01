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
import { discoverPlanDir } from "../plan/discover.js";
import type { ReinsDeps } from "../deps.js";
import type { ProposalDocument } from "../plan/parse.js";
import { proposalStore } from "../plan/proposals.js";
import { transition, type ReinsPhase, type ReinsState } from "../state.js";
import { requireUi } from "../ui/dialogs.js";
import { renderWidget } from "../ui/widget.js";

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

/** An approved intent: the proposal to apply at plan editing, by kind and target. */
export interface ApprovedIntent {
  proposalId: string;
  kind: "add" | "modify" | "remove";
  /** The target task id for modify and remove intents. */
  target?: string;
}

/** How a session ended. */
export type RenegotiationOutcomeKind = "completed" | "abandoned" | "refused";

/** The session's result: outcome, dispositions, and what the gate did. */
export interface RenegotiationOutcome {
  kind: RenegotiationOutcomeKind;
  /** The phase after the gate; undefined only for a refused session. */
  phase?: ReinsPhase;
  /** The gate opened: the current run must terminate here. */
  terminateRun: boolean;
  /** Approved proposals, as intents for plan editing. */
  approved: ApprovedIntent[];
  /** Deferred proposal ids (the durable deferred marker is set). */
  deferred: string[];
  /** Rejected proposal ids (the documents are deleted). */
  rejected: string[];
  report: string;
}

/** The disposition options every proposal dialog offers, in order. */
export const DISPOSITION_OPTIONS = ["Approve", "Defer", "Reject"] as const;

function refusal(
  deps: ReinsDeps,
  state: ReinsState,
  report: string,
): { state: ReinsState; result: RenegotiationOutcome } {
  deps.ui.notify(report, "error");
  return {
    state,
    result: {
      kind: "refused",
      terminateRun: false,
      approved: [],
      deferred: [],
      rejected: [],
      report,
    },
  };
}

function idOf(proposal: ProposalDocument): string {
  return String(proposal.frontmatter.id ?? proposal.file);
}

function kindOf(proposal: ProposalDocument): ApprovedIntent["kind"] {
  // Attach-time proposal validation guarantees the vocabulary; the
  // fallback keeps hand-edited external proposals from crashing the sweep.
  const kind = proposal.frontmatter.kind;
  return kind === "add" || kind === "modify" || kind === "remove" ? kind : "modify";
}

/**
 * The dialog content for one proposal: identity and target, the
 * rationale, and for additions the draft task content.
 */
export function presentationOf(proposal: ProposalDocument): string {
  const fm = proposal.frontmatter;
  const id = idOf(proposal);
  const kind = typeof fm.kind === "string" ? fm.kind : "unknown";
  const title = typeof fm.title === "string" ? fm.title : id;
  const target = typeof fm.target === "string" ? fm.target : undefined;
  const lines = [
    `Proposal ${id} (${kind}): ${title}`,
    target !== undefined ? `Target task: ${target}` : "Target: none (new work toward the goal)",
    "",
    "Rationale:",
    proposal.draft.rationale?.trim() !== "" && proposal.draft.rationale !== undefined
      ? proposal.draft.rationale
      : "(no rationale recorded)",
  ];
  const task = proposal.draft.task;
  if (task !== undefined) {
    lines.push(
      "",
      `Proposed task (draft): ${task.id ?? "(no id)"} - ${task.title ?? "(no title)"}`,
    );
    if (task.description !== undefined) lines.push("", "Description:", task.description);
    if (task.acceptanceCriteria !== undefined) {
      lines.push("", "Acceptance Criteria:", task.acceptanceCriteria);
    }
    if (task.constraints !== undefined) lines.push("", "Constraints:", task.constraints);
  }
  return lines.join("\n");
}

/**
 * Open the renegotiation gate over the entire pending set.
 *
 * The session terminates the current run at the gate (the caller
 * honors `terminateRun`; the current task stays in progress), takes
 * stock of every pending proposal including deferred ones, and walks
 * them one blocking approve/defer/reject dialog each. Without an
 * interactive UI it blocks fail-closed: nothing opens, nothing changes.
 */
export async function openRenegotiationSession(
  deps: ReinsDeps,
  state: ReinsState,
  _cause: SessionCause,
): Promise<{ state: ReinsState; result: RenegotiationOutcome }> {
  if (state.phase !== "executing" || state.planDir === undefined) {
    return refusal(deps, state, `reins: no active contract to renegotiate (phase: ${state.phase}).`);
  }
  const planDir = state.planDir;
  const scan = discoverPlanDir(deps.fs, planDir);
  const pending = proposalStore(scan).pending();
  if (pending.length === 0) {
    return refusal(deps, state, "reins: no pending change proposals to renegotiate.");
  }
  const uiRefusal = requireUi(deps, "Renegotiation");
  if (uiRefusal !== null) {
    // requireUi already notified the refusal; surface it verbatim.
    return {
      state,
      result: {
        kind: "refused",
        terminateRun: false,
        approved: [],
        deferred: [],
        rejected: [],
        report: uiRefusal,
      },
    };
  }

  // Enter the gate: the phase shows on the widget for the whole sweep.
  const gateState = transition(state, "renegotiating");
  renderWidget(deps, gateState, scan);

  // The sweep: every pending proposal, deferred ones included, one
  // blocking dialog each.
  for (const proposal of pending) {
    await deps.ui.select(presentationOf(proposal), [...DISPOSITION_OPTIONS]);
  }

  // The sweep ends the renegotiating state; with no approvals recorded
  // yet the contract returns to executing.
  const finalState = transition(gateState, "executing");
  renderWidget(deps, finalState, discoverPlanDir(deps.fs, planDir));
  const report = `Renegotiation session complete: now ${finalState.phase}.`;
  deps.ui.notify(report, "info");
  return {
    state: finalState,
    result: {
      kind: "completed",
      phase: finalState.phase,
      terminateRun: true,
      approved: [],
      deferred: [],
      rejected: [],
      report,
    },
  };
}
