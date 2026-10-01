/**
 * Task lifecycle tools: the only write path into task execution state.
 *
 * `reins_task_start`, `reins_task_complete`, `reins_task_block`, and
 * `reins_progress` produce durable frontmatter transitions in the plan
 * directory and one-line results; `reins_status` is the read-only
 * compact view. Every tool rescans the plan directory per invocation
 * (no caching, ever), refuses outside an active contract, and stamps
 * `generated` on every write. File mutations go through pi's
 * `withFileMutationQueue`, keyed by the task file's absolute path, so
 * plugin writes serialize against the built-in edit and write tools.
 */

import { join } from "node:path";

import {
  withFileMutationQueue,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir, type PlanScan } from "../plan/discover.js";
import { writeFields } from "../plan/write.js";
import type { TaskDocument } from "../plan/parse.js";
import type { ReinsState } from "../state.js";

/** The deps-and-state accessors every task tool executes through. */
export interface TaskToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
}

/** One-line text result, the shape pi surfaces to the model. */
export interface TaskToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, never>;
}

function result(text: string): TaskToolResult {
  return { content: [{ type: "text", text }], details: {} };
}

/** The bound plan directory, or a refusal naming what is missing. */
function requireActiveContract(state: ReinsState, toolName: string): string {
  if (state.phase === "detached" || state.planDir === undefined) {
    throw new Error(`${toolName}: no contract is attached; run /reins-attach <path> first.`);
  }
  if (state.phase !== "executing") {
    throw new Error(`${toolName}: the contract is not active (phase: ${state.phase}).`);
  }
  return state.planDir;
}

/** Find a task by semantic id in a scan; refusals name the known ids. */
function findTask(scan: PlanScan, params: Record<string, unknown>, toolName: string): TaskDocument {
  const taskId = params.taskId;
  if (typeof taskId !== "string" || taskId.trim() === "") {
    throw new Error(
      `${toolName}: a non-empty taskId is required (the task's semantic id, never the file path).`,
    );
  }
  const task = scan.tasks.find((candidate) => candidate.frontmatter.id === taskId);
  if (task === undefined) {
    const known = scan.tasks.map((candidate) => String(candidate.frontmatter.id ?? "(no id)")).join(", ");
    throw new Error(
      `${toolName}: no task with id "${taskId}" in the contract (known ids: ${known || "none"}).`,
    );
  }
  return task;
}

/** Start work on a task: marks it in_progress in the plan directory. */
export async function taskStart(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<TaskToolResult> {
  const planDir = requireActiveContract(state, "reins_task_start");
  const initial = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_start");
  return withFileMutationQueue(join(planDir, initial.file), async () => {
    // Fresh scan inside the queue: read and write of one file are one
    // atomic read-modify-write step.
    const task = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_start");
    const id = String(task.frontmatter.id);
    const status = task.frontmatter.executionStatus;
    if (status === "in_progress") {
      throw new Error(`reins_task_start: task "${id}" is already in_progress.`);
    }
    if (status === "done") {
      throw new Error(`reins_task_start: task "${id}" is already done.`);
    }
    writeFields(deps, task.file, { executionStatus: "in_progress" });
    return result(`Started ${id}.`);
  });
}

/** Complete a task: records the completion summary and marks it done. */
export async function taskComplete(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<TaskToolResult> {
  const planDir = requireActiveContract(state, "reins_task_complete");
  const summary = params.completionSummary;
  if (typeof summary !== "string" || summary.trim() === "") {
    throw new Error(
      "reins_task_complete: a non-empty completionSummary is required " +
        "(what was accomplished, against the task's acceptance criteria).",
    );
  }
  const initial = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_complete");
  return withFileMutationQueue(join(planDir, initial.file), async () => {
    const task = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_complete");
    const id = String(task.frontmatter.id);
    const status = task.frontmatter.executionStatus;
    if (status === "done") {
      throw new Error(`reins_task_complete: task "${id}" is already done.`);
    }
    if (status !== "in_progress") {
      throw new Error(
        `reins_task_complete: task "${id}" is ${describeStatus(status)}; ` +
          "start it before completing it (reins_task_start).",
      );
    }
    writeFields(deps, task.file, { executionStatus: "done", completionSummary: summary });
    return result(`Completed ${id}.`);
  });
}

function describeStatus(status: unknown): string {
  return typeof status === "string" ? status : "in an unknown status";
}

const TASK_ID_PARAM = Type.Object({
  taskId: Type.String({ description: "Semantic id of the task (its frontmatter id)" }),
});

/** Build the task lifecycle tool definitions over injected deps and state accessors. */
export function createTaskTools(io: TaskToolIo): Array<ToolDefinition<any, any, any>> {
  return [
    {
      name: "reins_task_start",
      label: "Start a task",
      description:
        "Start work on a task of the active execution contract: marks it in_progress in the plan " +
        "directory. Use the task's semantic id (frontmatter id), never the file path.",
      parameters: TASK_ID_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        taskStart(io.deps(ctx), io.state(), params),
    },
    {
      name: "reins_task_complete",
      label: "Complete a task",
      description:
        "Complete a task of the active execution contract: records the completion summary and marks " +
        "it done in the plan directory. A non-empty completionSummary is required.",
      parameters: Type.Object({
        taskId: TASK_ID_PARAM.properties.taskId,
        completionSummary: Type.String({
          description: "What was accomplished, against the task's acceptance criteria",
        }),
      }),
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        taskComplete(io.deps(ctx), io.state(), params),
    },
  ];
}
