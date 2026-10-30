/**
 * The session_start handler.
 *
 * Rebuilds the ephemeral plugin state from the durable plan directory
 * and the session's private entries. Without an attached contract the
 * plugin is inert: no notifications, no widget, no entries, no file
 * effects.
 *
 * Attach-state recovery is command-based (arch-spec decision 1): a
 * fresh session starts detached and the user re-attaches via
 * `/reins-attach`; the attach flow records the plan path as a private
 * session entry (`reins-attached`) for later reconciliation needs.
 *
 * Crash recovery (the plan-editing-review contract): leftover gate
 * records (`reins-gate-open` / `reins-gate-closed`) from a restarted
 * session reconcile into executing. The reconcile is strictly
 * advisory: the plan directory on disk is authoritative, so it touches
 * nothing durable. A durable review acceptance (log Update plus bumped
 * revision) is honored by leaving it in place; approved proposals the
 * crash left undeleted stay pending; materialized-but-unaccepted task
 * content survives as a documented residual (materialization refuses
 * duplicate ids, so a re-run session stays safe). The reconcile only
 * tells the user where things stand and queues a forced steering note;
 * re-attaching resumes executing, never a gate phase.
 */

import type { ReinsDeps } from "../deps.js";
import { freshState, type ReinsState } from "./../state.js";
import { GATE_CLOSED_ENTRY, GATE_OPEN_ENTRY } from "./renegotiate.js";

export interface SessionStartEvent {
  reason?: string;
}

interface GateRecordData {
  planDir?: unknown;
  phase?: unknown;
  /** The closed sweep's dispositions: approved, deferred, rejected ids. */
  approved?: unknown;
  deferred?: unknown;
  rejected?: unknown;
  abandoned?: unknown;
}

export function onSessionStart(deps: ReinsDeps, _event: SessionStartEvent): ReinsState {
  reconcileLeftoverGate(deps);
  // A fresh session re-attaches by command; the plan directory remains
  // the authority on state.
  return freshState();
}

/**
 * The crash-recovery reconcile: read the leftover gate records and
 * surface what the restart means. Zero durable effects, ever.
 */
function reconcileLeftoverGate(deps: ReinsDeps): void {
  const readEntries = deps.session.readEntries;
  if (readEntries === undefined) return;
  const records = readEntries().filter(
    (entry) => entry.customType === GATE_OPEN_ENTRY || entry.customType === GATE_CLOSED_ENTRY,
  );
  if (records.length === 0) return;

  const last = records[records.length - 1];
  const data = (last.data ?? {}) as GateRecordData;
  if (last.customType === GATE_CLOSED_ENTRY) {
    if (data.abandoned === true) {
      // The session abandoned its sweep; nothing was ever in flight.
      return;
    }
    if (Array.isArray(data.approved) && data.approved.length === 0) {
      // The sweep closed with no approvals: nothing was in flight.
      return;
    }
    const note =
      "The previous session was interrupted while a revision was in progress. " +
      "Executing resumes on the durable plan directory: it is authoritative. " +
      "Approved proposals the crash left undeleted stay pending; a durable " +
      "review acceptance (log Update plus bumped revision) is final.";
    deps.ui.notify(`reins: resuming in executing. ${note}`, "info");
    deps.steering.forceInject("gate-transition", note);
    return;
  }

  // A gate left open: the sweep itself was interrupted. Its
  // dispositions never applied durably by design; on-disk content is
  // authoritative either way.
  const note =
    "The previous session was interrupted inside a renegotiation session. " +
    "Executing resumes on the durable plan directory: it is authoritative. " +
    "Re-present pending proposals deliberately before working toward the goal.";
  deps.ui.notify(`reins: resuming in executing. ${note}`, "info");
  deps.steering.forceInject("gate-transition", note);
}
