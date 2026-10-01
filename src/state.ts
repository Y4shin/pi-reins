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
