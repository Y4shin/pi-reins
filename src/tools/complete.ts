/**
 * The reins_complete tool: the plan-level completion guard.
 *
 * Completing the plan is a tool call the plugin controls. Every call
 * reads the plan directory fresh (no caching, ever) and refuses with
 * the remaining-work list while any task is pending, in_progress, or
 * blocked; the refusal is a tool error, so the run continues with the
 * gap list in front of the model. The plan directory is the structural
 * truth: no text heuristics on what the agent said.
 *
 * Every call is a completion attempt, whatever its outcome: it sets
 * `state.completionAttempted`, which the steering engine consumes to
 * force the next injection.
 *
 * The full completion path beyond the guard (the deferred-proposal
 * walkthrough and the fresh-context completion verifier) is not part
 * of this ticket: until it lands, a passing guard also refuses rather
 * than faking a completion, and the contract stays executing.
 */

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import type { TaskDocument } from "../plan/parse.js";
import type { ReinsState } from "../state.js";
import { contractStatus, requireActiveContract, type TaskToolResult } from "./task.js";

/** The deps-and-state accessors the completion tool executes through. */
export interface CompleteToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
  /** Propagates the completion-attempt flag to the live state. */
  setState: (state: ReinsState) => void;
}

/** Collapse whitespace runs so a field fits the one-line result. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function idOf(task: TaskDocument): string {
  return String(task.frontmatter.id ?? task.file);
}

/**
 * The remaining-work list, shared by the completion refusal and the
 * settled backstop's pushback (the gap-list channel): every task that
 * is not done, with its status and any blocked reason.
 */
export function remainingWork(remaining: TaskDocument[]): string {
  const list = remaining
    .map((task) => {
      const status = task.frontmatter.executionStatus;
      const reason = task.frontmatter.blockedReason;
      const statusText = typeof status === "string" ? status : "unknown status";
      const reasonText =
        typeof reason === "string" && reason.trim() !== "" ? `: ${oneLine(reason)}` : "";
      return `${idOf(task)} (${statusText}${reasonText})`;
    })
    .join("; ");
  return `${remaining.length} task${remaining.length === 1 ? "" : "s"} remain: ${list}`;
}

/** The plan-level completion attempt: the guard decides whether it can proceed. */
export async function planComplete(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<TaskToolResult> {
  requireActiveContract(state, "reins_complete");
  // The attempt happened, whatever its outcome: the steering engine
  // forces the next injection and one-shot-clears the flag there.
  setState({ ...state, completionAttempted: true });

  const status = contractStatus(deps, state);
  if (status.remaining.length > 0) {
    throw new Error(
      `reins_complete: the contract is not complete. ${remainingWork(status.remaining)}. ` +
        "Finish every task (reins_task_start, reins_task_complete) before completing the plan.",
    );
  }
  throw new Error(
    "reins_complete: every task is done, but plan-level completion is not yet implemented " +
      "in this version; the contract stays executing.",
  );
}

/** Build the completion tool definition over injected deps and state accessors. */
export function createCompleteTool(io: CompleteToolIo): ToolDefinition<any, any, any> {
  return {
    name: "reins_complete",
    label: "Complete the plan",
    description:
      "Declare the execution contract complete. The plugin checks the plan directory: while any " +
      "task is pending, in_progress, or blocked the attempt is refused with the remaining-work list.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
      planComplete(io.deps(ctx), io.state(), io.setState),
  };
}
