/**
 * The steering engine: cadence and forced-trigger decisions for the
 * context-tail steering summary, the plugin's single injection point.
 *
 * Counters and one-shot flags are ephemeral, session-scoped state; the
 * summary itself is composed fresh per injection and appended after
 * stable history as a non-displaying custom message. The system prompt
 * is never modified and nothing persists into the session.
 *
 * Forced triggers reach the engine through the SteeringPort
 * (`forceInject`): gate transitions, expected-declaration hits, and any
 * other override entry point queue there and are consumed by the next
 * eligible injection, overriding the cadence. Post-compaction and
 * completion attempts arrive through their own legs (the session_compact
 * handler and the state's completionAttempted flag).
 */

import type { ContextEvent } from "@earendil-works/pi-coding-agent";

import type { ReinsDeps, SteeringPort } from "../deps.js";
import { discoverPlanDir } from "../plan/discover.js";
import type { ReinsState } from "../state.js";
import { composeSummary } from "./summary.js";

/** The custom message type of the context-tail steering summary. */
export const STEERING_MESSAGE_TYPE = "reins-steering";

/** Phases in which the contract is active and steering is injected. */
const STEERED_PHASES: readonly ReinsState["phase"][] = [
  "executing",
  "renegotiating",
  "plan-editing",
  "reviewing",
  "reconciling",
];

/** Inputs the context leg needs, built by the handler that registers it. */
export interface SteeringContextIo {
  /** The live ephemeral state, re-read per event. */
  state: ReinsState;
  /** Fresh deps rooted at the attached plan directory; built only when steering applies. */
  deps: () => ReinsDeps;
}

/** What the context leg returns: the (mutated) outgoing message list, or nothing. */
export type ContextResult = { messages: ContextEvent["messages"] } | undefined;

export interface SteeringEngine {
  /** The port wired as deps.steering: forced triggers queue here for the context leg. */
  port: SteeringPort;
  /** Run boundary (before_agent_start): the next context call is the run's first. */
  onRunStart(): void;
  /** Compaction happened (session_compact): force the next injection. */
  onCompacted(): void;
  /** The context leg: decide, compose, append at the tail. Undefined leaves the list untouched. */
  onContext(event: ContextEvent, io: SteeringContextIo): ContextResult;
}

export function createSteeringEngine(): SteeringEngine {
  /** Session-global LLM call counter (every context event). */
  let callCount = 0;
  /** LLM calls since the last run boundary. */
  let callInRun = 0;
  /** One-shot: a compaction happened, force the next injection. */
  let postCompaction = false;

  return {
    port: {
      forceInject() {},
    },
    onRunStart: () => {
      callInRun = 0;
    },
    onCompacted: () => {
      postCompaction = true;
    },
    onContext: (event, io) => {
      callCount += 1;
      callInRun += 1;
      const { state } = io;
      if (state.planDir === undefined || !STEERED_PHASES.includes(state.phase)) {
        return undefined;
      }
      const deps = io.deps();
      const cadence = deps.config.cadence;
      const cadenceDue = cadence > 0 && callCount % cadence === 0;
      if (!cadenceDue && callInRun !== 1) return undefined;

      const scan = discoverPlanDir(deps.fs, state.planDir);
      event.messages.push({
        role: "custom",
        customType: STEERING_MESSAGE_TYPE,
        content: composeSummary(state, scan),
        display: false,
        timestamp: Date.now(),
      });
      return { messages: event.messages };
    },
  };
}
