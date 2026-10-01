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
 * Reconciling leftover gate records from session entries lands with
 * the plan-editing-review ticket.
 */

import type { ReinsDeps } from "../deps.js";
import { freshState, type ReinsState } from "../state.js";

export interface SessionStartEvent {
  reason?: string;
}

export function onSessionStart(_deps: ReinsDeps, _event: SessionStartEvent): ReinsState {
  // Inert without an attached contract.
  return freshState();
}
