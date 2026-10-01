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

import { join } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import type { PlanScan } from "../plan/discover.js";
import { discoverPlanDir } from "../plan/discover.js";
import type { ReinsDeps } from "../deps.js";
import { snapshotPlanDir, type PlanSnapshot } from "../plan/fingerprint.js";
import type { ProposalDocument } from "../plan/parse.js";
import { proposalStore } from "../plan/proposals.js";
import { writeFields } from "../plan/write.js";
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
      // Eligible agreed work is exhausted when nothing is left to take
      // up: no pending or blocked task (startable) and none in flight
      // (an in_progress task is current work, not exhausted work).
      const openWork = scan.tasks.some((task) => {
        const status = task.frontmatter.executionStatus;
        return status === "pending" || status === "blocked" || status === "in_progress";
      });
      return !openWork && store.pending().some(triggering);
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

/** The custom type of the private session entry recorded when a gate opens. */
export const GATE_OPEN_ENTRY = "reins-gate-open";

/** The custom type of the private session entry recorded when a gate closes. */
export const GATE_CLOSED_ENTRY = "reins-gate-closed";

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
  /** The pre-session snapshot: what the review flow diffs against and abandon restores. */
  snapshot?: PlanSnapshot;
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
  cause: SessionCause,
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

  // Enter the gate: the phase shows on the widget for the whole sweep;
  // the open state is recorded so a crash-resumed session can reconcile
  // the leftover gate; steering is forced at the transition.
  const gateState = transition(state, "renegotiating");
  deps.session.appendEntry(GATE_OPEN_ENTRY, { planDir, phase: gateState.phase, cause: cause.kind });
  deps.steering.forceInject("gate-transition", "Renegotiation gate opened; pending change proposals await disposition.");
  renderWidget(deps, gateState, scan);
  // The pre-session snapshot: what the review flow diffs against and
  // what abandon restores. Taken before any disposition touches disk.
  const snapshot = snapshotPlanDir(deps.fs, planDir);

  // The sweep: every pending proposal, deferred ones included, one
  // blocking dialog each. Dispositions apply only when the sweep
  // completes; a dismissed dialog abandons the session untouched.
  const approvedFiles: string[] = [];
  const deferredFiles: string[] = [];
  const rejectedFiles: string[] = [];
  let abandoned = false;
  for (const proposal of pending) {
    const answer = await deps.ui.select(presentationOf(proposal), [...DISPOSITION_OPTIONS]);
    const disposition = answer?.trim().toLowerCase();
    if (disposition === "approve") approvedFiles.push(proposal.file);
    else if (disposition === "defer") deferredFiles.push(proposal.file);
    else if (disposition === "reject") rejectedFiles.push(proposal.file);
    else {
      // No answer (dismissed dialog) or an unrecognized one: the user
      // walked away mid-session. Nothing durable happens.
      abandoned = true;
      break;
    }
  }

  const byFile = new Map(pending.map((proposal) => [proposal.file, proposal]));
  if (abandoned) {
    const finalState = transition(gateState, "executing");
    deps.session.appendEntry(GATE_CLOSED_ENTRY, {
      planDir,
      phase: finalState.phase,
      approved: [],
      deferred: [],
      rejected: [],
      abandoned: true,
    });
    deps.steering.forceInject("gate-transition", "Renegotiation gate closed; session abandoned, nothing changed.");
    renderWidget(deps, finalState, discoverPlanDir(deps.fs, planDir));
    const report =
      "Renegotiation session abandoned mid-sweep; no dispositions were applied and nothing was changed.";
    deps.ui.notify(report, "info");
    return {
      state: finalState,
      result: {
        kind: "abandoned",
        phase: finalState.phase,
        terminateRun: true,
        approved: [],
        deferred: [],
        rejected: [],
        report,
      },
    };
  }

  // The sweep completed: the renegotiating state ends, so the
  // dispositions apply now. Deferred proposals carry the marker;
  // rejected proposals are deleted.
  for (const file of deferredFiles) {
    await withFileMutationQueue(join(planDir, file), async () => {
      writeFields(deps, file, { deferred: true });
    });
  }
  for (const file of rejectedFiles) {
    await withFileMutationQueue(join(planDir, file), async () => {
      if (deps.fs.exists(file)) deps.fs.delete(file);
    });
  }
  const approved = approvedFiles.map((file) => intentOf(byFile.get(file) as ProposalDocument));

  const finalState =
    approved.length > 0 ? transition(gateState, "plan-editing") : transition(gateState, "executing");
  // Entering plan-editing swaps raw edit and write out of the active
  // tool set (plan editing goes through the plugin tools).
  if (finalState.phase === "plan-editing") {
    const active = deps.toolset.getActiveTools();
    deps.toolset.setActiveTools(active.filter((name) => name !== "edit" && name !== "write"));
  }
  deps.session.appendEntry(GATE_CLOSED_ENTRY, {
    planDir,
    phase: finalState.phase,
    approved: approved.map((intent) => intent.proposalId),
    deferred: deferredFiles.map((file) => idOf(byFile.get(file) as ProposalDocument)),
    rejected: rejectedFiles.map((file) => idOf(byFile.get(file) as ProposalDocument)),
    abandoned: false,
  });
  deps.steering.forceInject("gate-transition", `Renegotiation gate closed; now ${finalState.phase}.`);
  renderWidget(deps, finalState, discoverPlanDir(deps.fs, planDir));
  const report =
    `Renegotiation session complete: ${approved.length} approved, ${deferredFiles.length} deferred, ` +
    `${rejectedFiles.length} rejected; now ${finalState.phase}.`;
  deps.ui.notify(report, "info");
  return {
    state: finalState,
    result: {
      kind: "completed",
      phase: finalState.phase,
      terminateRun: true,
      approved,
      deferred: deferredFiles.map((file) => idOf(byFile.get(file) as ProposalDocument)),
      rejected: rejectedFiles.map((file) => idOf(byFile.get(file) as ProposalDocument)),
      snapshot,
      report,
    },
  };
}

/** The approved intent a proposal becomes when the user approves it. */
function intentOf(proposal: ProposalDocument): ApprovedIntent {
  const target = proposal.frontmatter.target;
  const intent: ApprovedIntent = {
    proposalId: idOf(proposal),
    kind: kindOf(proposal),
  };
  if (typeof target === "string") intent.target = target;
  return intent;
}
