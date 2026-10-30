/**
 * The plan-editing tools: the only write path into the contract while
 * the renegotiation session's approved intents are materialized.
 *
 * `reins_materialize_add` creates the task document a draft addition
 * describes, `reins_edit_task` applies an approved modification, and
 * `reins_remove_task` applies an approved removal. Every tool is gated
 * on the session's approved intents (`state.planEditing.approved`) and
 * on the plan-editing phase: outside of it, and without a matching
 * approved intent, it refuses. `reins_finish_revision` submits the
 * revision to the review gate.
 *
 * Every call rescans the plan directory (no caching, ever), stamps
 * `generated` on every write, serializes each file mutation through
 * pi's `withFileMutationQueue`, and records its contract-significant
 * writes on `state.pluginContractWrites` for the drift monitor.
 */

import {
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import type { ReinsState, PlanEditingContext } from "../state.js";

/** The deps-and-state accessors every plan-editing tool executes through. */
export interface PlanEditingToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
  /** Propagate gate transitions and observed-write records (review outcomes). */
  setState: (state: ReinsState) => void;
}

/** One-line text result, the shape pi surfaces to the model. */
export interface PlanEditingToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
}

function result(text: string): PlanEditingToolResult {
  return { content: [{ type: "text", text }], details: {} };
}

/** The plan-editing session context, or a refusal naming the phase. */
export function requirePlanEditing(
  state: ReinsState,
  toolName: string,
): { planDir: string; planEditing: PlanEditingContext } {
  if (state.phase !== "plan-editing" || state.planDir === undefined || state.planEditing === undefined) {
    throw new Error(
      `${toolName}: the contract is not in plan editing (phase: ${state.phase}).`,
    );
  }
  return { planDir: state.planDir, planEditing: state.planEditing };
}

/** Record a contract-significant write for the drift monitor's verification. */
export function recordContractWrite(
  io: PlanEditingToolIo,
  file: string,
): void {
  const state = io.state();
  const observed = state.pluginContractWrites ?? [];
  if (observed.includes(file)) return;
  io.setState({ ...state, pluginContractWrites: [...observed, file] });
}

/**
 * Materialize an approved addition: create the task document the
 * proposal's draft describes. (Body in the materializeAdd slice.)
 */
export async function materializeAdd(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<PlanEditingToolResult> {
  requirePlanEditing(state, "reins_materialize_add");
  const proposalId = params.proposalId;
  if (typeof proposalId !== "string" || proposalId.trim() === "") {
    throw new Error("reins_materialize_add: a non-empty proposalId is required.");
  }
  // Gated on the session's approved intents; the file effects land with
  // the materialization slice.
  throw new Error(
    `reins_materialize_add: no approved addition for proposal "${proposalId}".`,
  );
}

/**
 * Apply an approved modification to a task document. (Body in the
 * materializeAdd slice.)
 */
export async function editTask(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<PlanEditingToolResult> {
  requirePlanEditing(state, "reins_edit_task");
  throw new Error("reins_edit_task: no approved modification to apply.");
}

/**
 * Apply an approved removal by deleting the task document. (Body in
 * the materializeAdd slice.)
 */
export async function removeTask(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<PlanEditingToolResult> {
  requirePlanEditing(state, "reins_remove_task");
  throw new Error("reins_remove_task: no approved removal to apply.");
}

/**
 * Submit the revision to the concrete review gate. (Body in the
 * review-gate slice.)
 */
export async function finishRevision(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<PlanEditingToolResult> {
  requirePlanEditing(state, "reins_finish_revision");
  throw new Error("reins_finish_revision: the review gate is not available yet.");
}

const PROPOSAL_ID_PARAM = Type.Object({
  proposalId: Type.String({ description: "Id of the approved addition proposal to materialize" }),
});

const TASK_ID_PARAM = Type.Object({
  taskId: Type.String({ description: "Semantic id of the task (its frontmatter id)" }),
});

const EDIT_FIELDS_PARAM = Type.Object({
  taskId: TASK_ID_PARAM.properties.taskId,
  title: Type.Optional(Type.String({ description: "New title for the task" })),
  description: Type.Optional(Type.String({ description: "New Description binding section" })),
  acceptanceCriteria: Type.Optional(Type.String({ description: "New Acceptance Criteria binding section" })),
  constraints: Type.Optional(Type.String({ description: "New Constraints binding section" })),
});

/** Build the plan-editing tool definitions over injected deps and state accessors. */
export function createPlanEditingTools(io: PlanEditingToolIo): Array<ToolDefinition<any, any, any>> {
  return [
    {
      name: "reins_materialize_add",
      label: "Materialize an approved addition",
      description:
        "Create the task document an approved addition proposal drafts: id, title, the three " +
        "binding sections, executionStatus pending, and the next numeric prefix. Legal during " +
        "plan editing only, for a proposal the user approved in the renegotiation session.",
      parameters: PROPOSAL_ID_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        materializeAdd(io.deps(ctx), io.state(), params),
    },
    {
      name: "reins_edit_task",
      label: "Edit a task per an approved modification",
      description:
        "Apply an approved modification to a task of the contract: title and the three binding " +
        "sections. Legal during plan editing only, for a target the user approved for modification.",
      parameters: EDIT_FIELDS_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        editTask(io.deps(ctx), io.state(), params),
    },
    {
      name: "reins_remove_task",
      label: "Remove a task per an approved removal",
      description:
        "Apply an approved removal by deleting the task's document. Legal during plan editing " +
        "only, for a target the user approved for removal.",
      parameters: TASK_ID_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        removeTask(io.deps(ctx), io.state(), params),
    },
    {
      name: "reins_finish_revision",
      label: "Submit the revision for review",
      description:
        "Finish plan editing and present the concrete revision to the user: the difference " +
        "between the pre-session plan and the current state, with accept, reject, and abandon. " +
        "Rejection returns to plan editing; acceptance makes the revision authoritative.",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        finishRevision(io.deps(ctx), io.state(), io.setState),
    },
  ];
}
