/**
 * Dialog guards shared by every user gate.
 *
 * Gates that need a user decision (activation, renegotiation, review)
 * degrade fail-closed: without an interactive UI they refuse rather
 * than auto-approve. `requireUi` is the one guard they all call.
 */

import type { ReinsDeps } from "../deps.js";

/**
 * Require an interactive UI for a user decision. Returns null when a
 * UI exists; otherwise notifies the refusal (error) once and returns
 * it, so the calling gate can surface the same report as its result
 * and changes nothing durable.
 */
export function requireUi(deps: ReinsDeps, action: string): string | null {
  if (deps.ui.hasUI) return null;
  const refusal =
    `reins: ${action} needs an interactive UI to confirm with you; ` +
    "refusing rather than acting without confirmation.";
  deps.ui.notify(refusal, "error");
  return refusal;
}
