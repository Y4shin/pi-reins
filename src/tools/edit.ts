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

import { join } from "node:path";

import {
  withFileMutationQueue,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir } from "../plan/discover.js";
import { dumpDocument, splitFrontmatter, type ProposalDraftTask } from "../plan/parse.js";
import { generatedBy, rewriteBindingSections, writeFields } from "../plan/write.js";
import { finishRevisionReview } from "../handlers/review.js";
import { recordContractWrite, type ReinsState, type PlanEditingContext } from "../state.js";
import { renderWidget } from "../ui/widget.js";

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

/**
 * Record a contract-significant write for the drift monitor's verification.
 */
function recordWrite(
  state: ReinsState,
  setState: (state: ReinsState) => void,
  file: string,
): void {
  recordContractWrite(state, setState, file);
}

/**
 * The approved intent for a target task, or a refusal naming the approved set.
 */
function requireTargetIntent(
  planEditing: PlanEditingContext,
  kind: "add" | "modify" | "remove",
  target: string,
  toolName: string,
  wanted: string,
): PlanEditingContext["approved"][number] {
  const intent = planEditing.approved.find(
    (candidate) => candidate.kind === kind && candidate.target === target,
  );
  if (intent === undefined) {
    const approved =
      planEditing.approved
        .map((candidate) => `${candidate.proposalId} (${candidate.kind}${candidate.target !== undefined ? ` on ${candidate.target}` : ""})`)
        .join(", ") || "none";
    throw new Error(`${toolName}: ${wanted} (approved: ${approved}).`);
  }
  return intent;
}

/** A provided string parameter, or undefined when absent or non-string. */
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * The next task file name for a new task id: the fixture-driven
 * convention is a numeric prefix ten above the highest existing task
 * prefix (100 when there are none), zero-padded to three digits, and
 * bumped in tens past any name collision.
 */
function nextTaskFile(fs: ReinsDeps["fs"], existingFiles: string[], id: string): string {
  let max = 0;
  for (const file of existingFiles) {
    const prefix = file.match(/^(\d+)/);
    if (prefix) max = Math.max(max, parseInt(prefix[1], 10));
  }
  let prefix = (existingFiles.length === 0 ? 90 : max) + 10;
  let file = `${String(prefix).padStart(3, "0")}-${id}.md`;
  while (fs.exists(file)) {
    prefix += 10;
    file = `${String(prefix).padStart(3, "0")}-${id}.md`;
  }
  return file;
}

/** The task document body for a materialized draft: the binding sections under the `# Task` H1. */
function composeTaskBody(draft: ProposalDraftTask): string {
  return [
    "# Task",
    "",
    "## Description",
    "",
    draft.description ?? "",
    "",
    "## Acceptance Criteria",
    "",
    draft.acceptanceCriteria ?? "",
    "",
    "## Constraints",
    "",
    draft.constraints ?? "",
    "",
  ].join("\n");
}

/**
 * Materialize an approved addition: create the task document the
 * proposal's draft describes. The draft id must not collide with an
 * existing task (a re-run session stays safe: the refusal blocks the
 * duplicate, the operator resolves the leftover).
 */
export async function materializeAdd(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
  setState: (state: ReinsState) => void,
): Promise<PlanEditingToolResult> {
  const { planDir, planEditing } = requirePlanEditing(state, "reins_materialize_add");
  const proposalId = optionalText(params.proposalId);
  if (proposalId === undefined) {
    throw new Error("reins_materialize_add: a non-empty proposalId is required.");
  }
  // Additions are identified by their proposal id (they carry no target).
  const intent = planEditing.approved.find(
    (candidate) => candidate.kind === "add" && candidate.proposalId === proposalId,
  );
  if (intent === undefined) {
    const approved =
      planEditing.approved
        .map((candidate) => `${candidate.proposalId} (${candidate.kind}${candidate.target !== undefined ? ` on ${candidate.target}` : ""})`)
        .join(", ") || "none";
    throw new Error(
      `reins_materialize_add: no approved addition for proposal "${proposalId}" (approved: ${approved}).`,
    );
  }

  const scan = discoverPlanDir(deps.fs, planDir);
  const proposal = scan.proposals.find(
    (candidate) => candidate.frontmatter.id === proposalId || candidate.file === `proposals/${proposalId}.md`,
  );
  if (proposal === undefined) {
    throw new Error(
      `reins_materialize_add: the proposal document for "${proposalId}" is not in the plan directory anymore.`,
    );
  }
  const draft = proposal.draft.task;
  if (
    draft === undefined ||
    typeof draft.id !== "string" || draft.id.trim() === "" ||
    typeof draft.title !== "string" || draft.title.trim() === ""
  ) {
    throw new Error(
      `reins_materialize_add: proposal "${proposalId}" carries no complete draft task (id and title); refusing to materialize it half-written.`,
    );
  }
  const id = draft.id.trim();
  const title = draft.title.trim();
  if (scan.tasks.some((task) => task.frontmatter.id === id)) {
    throw new Error(
      `reins_materialize_add: a task with id "${id}" already exists; materializing "${proposalId}" would create a duplicate id.`,
    );
  }

  const file = nextTaskFile(deps.fs, scan.tasks.map((task) => task.file), id);
  const frontmatter = {
    type: "Task",
    id,
    title,
    executionStatus: "pending",
    generated: { by: generatedBy(), at: deps.now() },
  };
  await withFileMutationQueue(join(planDir, file), async () => {
    deps.fs.write(file, dumpDocument(frontmatter, composeTaskBody(draft)));
  });
  recordWrite(state, setState, file);
  renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
  return result(`Added task ${id} (${file}) from proposal ${proposalId}.`);
}

/**
 * Apply an approved modification: title in frontmatter, the three
 * binding sections in the body, everything else untouched.
 * Frontmatter extensions beyond the named fields stay out of Phase 1
 * editing, and executionStatus is owned by the lifecycle tools.
 */
export async function editTask(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
  setState: (state: ReinsState) => void,
): Promise<PlanEditingToolResult> {
  const { planDir, planEditing } = requirePlanEditing(state, "reins_edit_task");
  const taskId = optionalText(params.taskId);
  if (taskId === undefined) {
    throw new Error("reins_edit_task: a non-empty taskId is required (the task's semantic id, never the file path).");
  }
  requireTargetIntent(
    planEditing,
    "modify",
    taskId,
    "reins_edit_task",
    `no approved modification for task "${taskId}"`,
  );
  const updates = {
    title: optionalText(params.title),
    description: optionalText(params.description),
    acceptanceCriteria: optionalText(params.acceptanceCriteria),
    constraints: optionalText(params.constraints),
  };
  const provided = Object.values(updates).filter((value) => value !== undefined);
  if (provided.length === 0) {
    throw new Error(
      "reins_edit_task: provide at least one of title, description, acceptanceCriteria, constraints to edit.",
    );
  }

  const scan = discoverPlanDir(deps.fs, planDir);
  const task = scan.tasks.find((candidate) => candidate.frontmatter.id === taskId);
  if (task === undefined) {
    const known = scan.tasks.map((candidate) => String(candidate.frontmatter.id ?? "(no id)")).join(", ");
    throw new Error(`reins_edit_task: no task with id "${taskId}" in the contract (known ids: ${known || "none"}).`);
  }
  const { title, ...sections } = updates;
  await withFileMutationQueue(join(planDir, task.file), async () => {
    // Fresh read inside the queue: read and write of one file are one
    // atomic read-modify-write step.
    const text = deps.fs.read(task.file);
    const split = splitFrontmatter(text);
    const newBody = rewriteBindingSections(split.body, sections);
    writeFields(deps, task.file, title !== undefined ? { title } : {}, { body: newBody });
  });
  recordWrite(state, setState, task.file);
  renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
  return result(`Edited ${taskId}.`);
}

/**
 * Apply an approved removal by deleting the task's document.
 */
export async function removeTask(
  deps: ReinsDeps,
  state: ReinsState,
  params: Record<string, unknown>,
  setState: (state: ReinsState) => void,
): Promise<PlanEditingToolResult> {
  const { planDir, planEditing } = requirePlanEditing(state, "reins_remove_task");
  const taskId = optionalText(params.taskId);
  if (taskId === undefined) {
    throw new Error("reins_remove_task: a non-empty taskId is required (the task's semantic id, never the file path).");
  }
  requireTargetIntent(
    planEditing,
    "remove",
    taskId,
    "reins_remove_task",
    `no approved removal for task "${taskId}"`,
  );

  const scan = discoverPlanDir(deps.fs, planDir);
  const task = scan.tasks.find((candidate) => candidate.frontmatter.id === taskId);
  if (task === undefined) {
    const known = scan.tasks.map((candidate) => String(candidate.frontmatter.id ?? "(no id)")).join(", ");
    throw new Error(`reins_remove_task: no task with id "${taskId}" in the contract (known ids: ${known || "none"}).`);
  }
  await withFileMutationQueue(join(planDir, task.file), async () => {
    if (deps.fs.exists(task.file)) deps.fs.delete(task.file);
  });
  recordWrite(state, setState, task.file);
  renderWidget(deps, state, discoverPlanDir(deps.fs, planDir));
  return result(`Removed ${taskId} (${task.file}).`);
}

/**
 * Submit the revision to the concrete review gate: the phase
 * transition to reviewing and the post-dialog returns happen inside
 * this tool execution (the tool IO carries the setState accessor).
 */
export async function finishRevision(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<PlanEditingToolResult> {
  const outcome = await finishRevisionReview(deps, state, setState);
  if (outcome.result.kind === "refused") {
    // The fail-closed refusal (no interactive UI): surface verbatim.
    throw new Error(outcome.result.report);
  }
  return result(outcome.result.report);
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
        materializeAdd(io.deps(ctx), io.state(), params, io.setState),
    },
    {
      name: "reins_edit_task",
      label: "Edit a task per an approved modification",
      description:
        "Apply an approved modification to a task of the contract: title and the three binding " +
        "sections. Legal during plan editing only, for a target the user approved for modification.",
      parameters: EDIT_FIELDS_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        editTask(io.deps(ctx), io.state(), params, io.setState),
    },
    {
      name: "reins_remove_task",
      label: "Remove a task per an approved removal",
      description:
        "Apply an approved removal by deleting the task's document. Legal during plan editing " +
        "only, for a target the user approved for removal.",
      parameters: TASK_ID_PARAM,
      execute: async (_toolCallId, params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
        removeTask(io.deps(ctx), io.state(), params, io.setState),
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
