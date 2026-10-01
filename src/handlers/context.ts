/**
 * The context-event handler: the plugin's single injection point.
 *
 * Before each LLM call the steering engine decides whether the
 * contract's steering summary is appended after stable history; the
 * handler supplies the live state and the deps rooted at the attached
 * plan directory, and forwards the outgoing message list untouched when
 * the engine declines. Without an active contract nothing is built,
 * injected, or persisted.
 */

import type { ContextEvent } from "@earendil-works/pi-coding-agent";

import type { ReinsDeps } from "../deps.js";
import type { ContextResult, SteeringEngine } from "../steering/engine.js";
import type { ReinsState } from "../state.js";

export interface ContextHandlerIo {
  /** Live ephemeral state, re-read per event. */
  state: () => ReinsState;
  /** Deps factory; the wiring roots the fs port at the attached plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
}

/** The pi-facing context handler over the steering engine. */
export function createContextHandler(engine: SteeringEngine, io: ContextHandlerIo) {
  return (event: ContextEvent, ctx: unknown): ContextResult =>
    engine.onContext(event, { state: io.state(), deps: () => io.deps(ctx) });
}
