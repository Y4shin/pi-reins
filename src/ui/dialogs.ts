/**
 * Dialog guards shared by every user gate.
 *
 * Gates that need a user decision (activation, renegotiation, review)
 * degrade fail-closed: without an interactive UI they refuse rather
 * than auto-approve. `requireUi` is the one guard they all call.
 */

import type { ReinsDeps } from "../deps.js";

/**
 * Require an interactive UI for a user decision. Returns true when a
 * UI exists; otherwise notifies the refusal (error) and returns false,
 * so the calling gate acts exactly like any other refusal and changes
 * nothing durable.
 */
export function requireUi(deps: ReinsDeps, action: string): boolean {
  if (deps.ui.hasUI) return true;
  deps.ui.notify(
    `reins: ${action} needs an interactive UI to confirm with you; ` +
      "refusing rather than acting without confirmation.",
    "error",
  );
  return false;
}
