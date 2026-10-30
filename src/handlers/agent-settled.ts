/**
 * The agent_settled backstop.
 *
 * When a run truly settles (agent_settled: no retry, compaction, or
 * queued continuation will follow), the durable plan directory is
 * compared against what the run accomplished. With an active, incomplete
 * contract the settled run stopped short of the agreed work, so a
 * corrective run is seeded by a real user-role pushback message listing
 * the remaining work: `sendUserMessage` is the measured reliable channel
 * (it goes through the full prompt path and lands in the user-visible
 * history), not `sendMessage` and not a steering injection.
 *
 * The comparison is structural: the plan directory is the truth, no
 * text heuristics on what the agent said. A clean state or an inactive
 * contract fires nothing.
 *
 * The pushback chain is capped at `config.pushbackMax`. Its counter
 * lives in the ephemeral state and resets when a user submits a prompt
 * (`before_agent_start`), but not when the pushback run itself starts:
 * the backstop arms the run it seeds and consumes that mark at the next
 * run boundary.
 */

import type { ReinsDeps } from "../deps.js";
import type { ReinsState } from "../state.js";
import { remainingWork } from "../tools/complete.js";
import { contractStatus } from "../tools/task.js";

/** The state and deps accessors the backstop reads per settled run. */
export interface SettledBackstopIo {
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
  /** Propagates the chain counter to the live state. */
  setState: (state: ReinsState) => void;
  /** Fresh deps rooted at the attached plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
}

export function createSettledBackstop(io: SettledBackstopIo) {
  /** Whether the run about to start is the pushback run this backstop seeded. */
  let pushbackRunArmed = false;

  return {
    /**
     * The before_agent_start leg: a run boundary. The pushback run this
     * backstop seeded consumes the armed mark and keeps the counter; a
     * genuine user-submitted prompt resets the chain.
     */
    onRunStart(): void {
      const state = io.state();
      if (pushbackRunArmed) {
        pushbackRunArmed = false;
        return;
      }
      if ((state.pushbackCount ?? 0) !== 0) {
        io.setState({ ...state, pushbackCount: 0 });
      }
    },

    /** The agent_settled leg: compare durable state, push back when work remains. */
    onSettled(ctx: unknown): void {
      const state = io.state();
      // Only an active contract owes work; gates own their own phases.
      if (state.phase !== "executing" || state.planDir === undefined) return;
      const deps = io.deps(ctx);
      const status = contractStatus(deps, state);
      if (status.remaining.length === 0) return;
      if ((state.pushbackCount ?? 0) >= deps.config.pushbackMax) return;
      io.setState({ ...state, pushbackCount: (state.pushbackCount ?? 0) + 1 });
      pushbackRunArmed = true;
      deps.messenger.sendUserMessage(
        `Execution contract not complete. ${remainingWork(status.remaining)}. ` +
          "Continue with the next task: start it, work it, record progress with " +
          "reins_progress, and complete it with reins_task_complete.",
      );
    },
  };
}
