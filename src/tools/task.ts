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
import { renderWidget } from "../ui/widget.js";

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
    // Blocked -> start is a resume: the stale blocked reason no longer
    // applies and is removed from the frontmatter entirely.
    const resuming = status === "blocked";
    writeFields(
      deps,
      task.file,
      { executionStatus: "in_progress" },
      { remove: resuming ? ["blockedReason"] : [] },
    );
    renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
    return result(resuming ? `Resumed ${id}.` : `Started ${id}.`);
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
    renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
    return result(`Completed ${id}.`);
  });
}

/** Mark a task blocked: records the reason that is blocking it. */
export async function taskBlock(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<TaskToolResult> {
  const planDir = requireActiveContract(state, "reins_task_block");
  const reason = params.reason;
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new Error("reins_task_block: a non-empty reason is required (what is blocking the task).");
  }
  const initial = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_block");
  return withFileMutationQueue(join(planDir, initial.file), async () => {
    const task = findTask(discoverPlanDir(deps.fs, planDir), params, "reins_task_block");
    const id = String(task.frontmatter.id);
    if (task.frontmatter.executionStatus === "done") {
      throw new Error(`reins_task_block: task "${id}" is already done; it cannot be blocked.`);
    }
    writeFields(deps, task.file, { executionStatus: "blocked", blockedReason: reason });
    renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
    return result(`Blocked ${id}.`);
  });
}

function describeStatus(status: unknown): string {
  return typeof status === "string" ? status : "in an unknown status";
}

/**
 * Record a progress note: appends `{ at, note }` to the active task's
 * append-only progressLog (past entries are never rewritten) and
 * re-renders the widget so the Now line shows the latest entry.
 */
export async function taskProgress(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
): Promise<TaskToolResult> {
  const planDir = requireActiveContract(state, "reins_progress");
  const note = params.note;
  if (typeof note !== "string" || note.trim() === "") {
    throw new Error("reins_progress: a non-empty note is required (a short progress message).");
  }
  const target = resolveProgressTarget(discoverPlanDir(deps.fs, planDir), params);
  return withFileMutationQueue(join(planDir, target.file), async () => {
    const task = findTask(discoverPlanDir(deps.fs, planDir), { taskId: params.taskId ?? target.frontmatter.id }, "reins_progress");
    const id = String(task.frontmatter.id);
    const existing = task.frontmatter.progressLog;
    if (existing !== undefined && existing !== null && !Array.isArray(existing)) {
      throw new Error(
        `reins_progress: progressLog of task "${id}" is not a list; refusing to overwrite past entries.`,
      );
    }
    // Past entries are preserved verbatim; only the new entry is added.
    const log = Array.isArray(existing) ? [...existing] : [];
    log.push({ at: deps.now(), note });
    writeFields(deps, task.file, { progressLog: log });
    renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
    return result(`Recorded progress on ${id}.`);
  });
}

/** The task a progress note belongs to: the named task, or the single active one. */
function resolveProgressTarget(scan: PlanScan, params: Record<string, unknown>): TaskDocument {
  const active = scan.tasks.filter((task) => task.frontmatter.executionStatus === "in_progress");
  if (params.taskId !== undefined) {
    const task = findTask(scan, params, "reins_progress");
    if (task.frontmatter.executionStatus !== "in_progress") {
      throw new Error(
        `reins_progress: task "${String(task.frontmatter.id)}" is not in_progress ` +
          `(${describeStatus(task.frontmatter.executionStatus)}); progress records active work.`,
      );
    }
    return task;
  }
  if (active.length === 0) {
    throw new Error(
      "reins_progress: no task is in_progress; start one first (reins_task_start) or name the task with taskId.",
    );
  }
  if (active.length > 1) {
    const ids = active.map((task) => String(task.frontmatter.id)).join(", ");
    throw new Error(`reins_progress: taskId is required while several tasks are in_progress (${ids}).`);
  }
  return active[0];
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
    {
      name: "reins_task_block",
      label: "Block a task",
      description:
        "Mark a task of the active execution contract as blocked, with the reason it is blocked. " +
        "A non-empty reason is required; resume later with reins_task_start.",
      parameters: Type.Object({
        taskId: TASK_ID_PARAM.properties.taskId,
        reason: Type.String({ description: "What is blocking the task" }),
      }),
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        taskBlock(io.deps(ctx), io.state(), params),
    },
    {
      name: "reins_progress",
      label: "Record progress",
      description:
        "Record a progress note on the active task's durable progressLog (append-only). " +
        "taskId is required when several tasks are in_progress.",
      parameters: Type.Object({
        note: Type.String({ description: "Short progress message" }),
        taskId: Type.Optional(TASK_ID_PARAM.properties.taskId),
      }),
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        taskProgress(io.deps(ctx), io.state(), params),
    },
  ];
}
