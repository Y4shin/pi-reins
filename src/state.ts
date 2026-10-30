/**
 * The ephemeral plugin state machine.
 *
 * States and legal transitions per the architecture spec:
 *
 *   detached -> attached      (attach: validation passes)
 *   detached -> executing     (attach of an already-active plan)
 *   attached -> executing     (activate: user confirmed)
 *   executing -> renegotiating (trigger fires)
 *   renegotiating -> plan-editing (at least one approved intent)
 *   renegotiating -> executing (sweep with no approval, or abandon)
 *   plan-editing -> reviewing  (finish revision)
 *   plan-editing -> executing  (abandon: restore pre-session snapshot)
 *   reviewing -> executing     (accept)
 *   reviewing -> plan-editing  (reject)
 *   executing -> reconciling   (out-of-band detection)
 *   reconciling -> executing   (user reconciles)
 *   executing -> completed     (verified plan completion)
 *
 * This state is ephemeral and always reconciled against the durable
 * plan directory at session_start; it is never persisted.
 */

import type { ApprovedIntent } from "./handlers/renegotiate.js";
import type { PlanSnapshot } from "./plan/fingerprint.js";

export type ReinsPhase =
  | "detached"
  | "attached"
  | "executing"
  | "renegotiating"
  | "plan-editing"
  | "reviewing"
  | "reconciling"
  | "completed";

export const REINS_TRANSITIONS: Record<ReinsPhase, readonly ReinsPhase[]> = {
  detached: ["attached", "executing"],
  attached: ["executing"],
  executing: ["renegotiating", "reconciling", "completed"],
  renegotiating: ["plan-editing", "executing"],
  "plan-editing": ["reviewing", "executing"],
  reviewing: ["executing", "plan-editing"],
  reconciling: ["executing"],
  completed: [],
};

export interface ReinsState {
  phase: ReinsPhase;
  /** The attached plan directory path, once a contract is attached. */
  planDir?: string;
  /**
   * Set when a completion attempt has been made; the steering engine
   * reads it to force an injection (the completion-guard ticket sets it).
   */
  completionAttempted?: boolean;
  /**
   * The settled-run pushback chain counter (the agent_settled backstop
   * increments it per pushback, capped by config.pushbackMax); a
   * user-submitted prompt resets it, the pushback run's own start does not.
   */
  pushbackCount?: number;
  /**
   * Contract-significant files the plugin itself wrote during the
   * current turn. Tools that write contract content (the plan-editing
   * tools, plan-editing-review) record their files here; the
   * out-of-band drift monitor drains the list at the turn-end
   * verification, so the plugin's own writes are never treated as
   * out-of-band. Ephemeral like the rest of this state; never persisted.
   */
  pluginContractWrites?: string[];
  /**
   * The plan-editing session context, present only in the
   * plan-editing and reviewing phases: the approved intents the
   * materialization tools are gated on, the pre-session snapshot the
   * review flow diffs against and abandon restores, and the active
   * tool set to restore when the review concludes. Ephemeral like the
   * rest of this state: a restart drops it, and the session-start
   * reconcile resumes in executing on the durable plan directory.
   */
  planEditing?: PlanEditingContext;
  /**
   * Deferred proposals folded during the completion walkthrough whose
   * designated durable target has not verified yet. Ephemeral like the
   * rest of this state: the proposal documents stay on disk until the
   * fold verifies, so a restart re-asks the disposition.
   */
  completionFolds?: CompletionFold[];
  /**
   * Why completion verification is unavailable (pi-subagents absence),
   * set once per session at the session_start registration attempt.
   * Undefined means the verifier registered. The completion tool
   * refuses on it with the named error and the widget carries the
   * marker while it is set. Ephemeral like the rest of this state.
   */
  verifierUnavailable?: string;
}

/** The renegotiation session's in-flight revision, carried by the phase it belongs to. */
export interface PlanEditingContext {
  /** Approved proposals, as the intents plan editing materializes. */
  approved: ApprovedIntent[];
  /** The pre-session snapshot: the review diff base and the abandon restore. */
  snapshot: PlanSnapshot;
  /** The active tool set before the plan-editing swap; restored at the review's end. */
  tools: string[];
}

/**
 * A deferred proposal folded during the completion walkthrough: the
 * user designated a durable target location, and the agent still owes
 * the write (it lands with the agent's normal tools, outside the plan
 * directory). Ephemeral like the rest of this state: a restart drops
 * it, and the next walkthrough re-asks the disposition, since the
 * proposal document stays on disk until the fold verifies.
 */
export interface CompletionFold {
  /** The proposal's semantic id (frontmatter id). */
  proposalId: string;
  /** The proposal document's plan-relative path. */
  file: string;
  /** The user-designated durable location the content is folded into. */
  target: string;
}

export function freshState(): ReinsState {
  return { phase: "detached" };
}

/** Move to the given phase; throws when the transition is illegal. */
export function transition(state: ReinsState, to: ReinsPhase): ReinsState {
  const allowed = REINS_TRANSITIONS[state.phase] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`illegal state transition: ${state.phase} -> ${to}`);
  }
  return { ...state, phase: to };
}

/**
 * Record a contract-significant file the plugin wrote (the
 * plan-editing tools, the review gate's acceptance and restore) on the
 * state the drift monitor drains at its next verification, so the
 * plugin's own writes are never treated as out-of-band. Ephemeral:
 * the record rides the state and is never persisted.
 */
export function recordContractWrite(
  state: ReinsState,
  setState: (state: ReinsState) => void,
  file: string,
): void {
  const observed = state.pluginContractWrites ?? [];
  if (observed.includes(file)) return;
  setState({ ...state, pluginContractWrites: [...observed, file] });
}
