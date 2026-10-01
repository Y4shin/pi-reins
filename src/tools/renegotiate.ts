/**
 * The reins_renegotiate tool: the agent's deliberate opening of the
 * renegotiation gate. Every pending change proposal (deferred ones
 * included) is presented for an approve, defer, or reject decision;
 * the current run terminates at the gate. Refusals (nothing attached,
 * nothing pending, no interactive UI) surface as tool errors.
 */

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import { openRenegotiationSession } from "../handlers/renegotiate.js";
import type { ReinsState } from "../state.js";

/** The deps-and-state accessors the tool executes through. */
export interface RenegotiateToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
  /** Propagate the state the session ended in (gate transitions). */
  setState: (state: ReinsState) => void;
}

/** One-line text result, plus the run-termination flag when the gate opened. */
export interface RenegotiateToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
  terminate?: boolean;
}

function result(text: string, terminate?: boolean): RenegotiateToolResult {
  return { content: [{ type: "text", text }], details: {}, ...(terminate ? { terminate } : {}) };
}

/** Open the renegotiation gate on the agent's initiative. */
export async function renegotiate(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<RenegotiateToolResult> {
  const outcome = await openRenegotiationSession(deps, state, { kind: "initiative" });
  setState(outcome.state);
  if (outcome.result.kind === "refused") {
    throw new Error(outcome.result.report);
  }
  return result(outcome.result.report, outcome.result.terminateRun);
}

/** Build the reins_renegotiate tool definition over injected deps and state accessors. */
export function createRenegotiateTool(io: RenegotiateToolIo): ToolDefinition<any, any, any> {
  return {
    name: "reins_renegotiate",
    label: "Open the renegotiation gate",
    description:
      "Open the renegotiation gate now: every pending change proposal (deferred ones included) is " +
      "presented for an approve, defer, or reject decision, and the current run terminates at the " +
      "gate. The contract enters plan editing when a proposal is approved.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
      renegotiate(io.deps(ctx), io.state(), io.setState),
  };
}
