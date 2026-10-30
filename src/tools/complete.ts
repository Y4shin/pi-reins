/**
 * The reins_complete tool: the plan-level completion path.
 *
 * Completing the plan is a tool call the plugin controls. Every call
 * reads the plan directory fresh (no caching, ever) and runs, in
 * order:
 *
 *  1. the structural guard: while any task is pending, in_progress, or
 *     blocked, the attempt is refused with the remaining-work list;
 *  2. the deferred-proposal walkthrough: every deferred proposal is
 *     walked through with the user, one blocking fold-or-drop dialog
 *     each. A drop deletes the proposal document immediately; a fold
 *     designates a durable target location that the agent writes with
 *     its normal tools, verified structurally on the next attempt. The
 *     plan cannot complete while any deferred proposal is unresolved;
 *  3. the fresh-context completion verifier (registered through
 *     pi-subagents at session_start, stubbed in tests): its verdict
 *     decides between the records and a refusal naming the gaps. The
 *     verifier is a hard dependency: without it completion refuses
 *     with a named error rather than skipping the judgment.
 *
 * On success the log Completion entry is written and the plan flips to
 * completed (the phase transition happens inside the tool execution).
 * Every attempt sets `state.completionAttempted`, which the steering
 * engine consumes to force the next injection.
 */

import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import {
  withFileMutationQueue,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ReinsDeps } from "../deps.js";
import { presentationOf } from "../handlers/renegotiate.js";
import { discoverPlanDir, type PlanScan } from "../plan/discover.js";
import type { ProposalDocument, TaskDocument } from "../plan/parse.js";
import { proposalStore } from "../plan/proposals.js";
import { LOG_FILE, prependLogEntry, writeFields } from "../plan/write.js";
import { transition, type CompletionFold, type ReinsState } from "../state.js";
import { requireUi } from "../ui/dialogs.js";
import { renderWidget } from "../ui/widget.js";
import { contractStatus, requireActiveContract, type TaskToolResult } from "./task.js";

/** The deps-and-state accessors the completion tool executes through. */
export interface CompleteToolIo {
  /** Fresh deps per execution; the wiring roots the fs port at the plan directory. */
  deps: (ctx: unknown) => ReinsDeps;
  /** Live read of the ephemeral plugin state. */
  state: () => ReinsState;
  /** Propagates the completion-attempt flag and the completed flip to the live state. */
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
  const noun = remaining.length === 1 ? "task" : "tasks";
  const verb = remaining.length === 1 ? "remains" : "remain";
  return `${remaining.length} ${noun} ${verb}: ${list}`;
}

/** The plan-level completion attempt: the guard decides whether it can proceed. */
export async function planComplete(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<TaskToolResult> {
  const planDir = requireActiveContract(state, "reins_complete");
  // The attempt happened, whatever its outcome: the steering engine
  // forces the next injection and one-shot-clears the flag there.
  const attempting = { ...state, completionAttempted: true };
  setState(attempting);

  const status = contractStatus(deps, state);
  if (status.remaining.length > 0) {
    throw new Error(
      `reins_complete: the contract is not complete. ${remainingWork(status.remaining)}. ` +
        "Finish every task (reins_task_start, reins_task_complete) before completing the plan.",
    );
  }

  // A hard dependency, never silently skipped: without the verifier
  // (pi-subagents absent at session start) completion refuses by name.
  if (state.verifierUnavailable !== undefined) {
    throw new Error(
      `reins_complete: the completion verifier is unavailable (${state.verifierUnavailable}). ` +
        `Plan completion is verified by the fresh-context reins-completion-verifier agent, run ` +
        "through pi-subagents; install pi-subagents (pi install npm:pi-subagents) and restart the session.",
    );
  }

  // The walkthrough: every deferred proposal ends folded or dropped
  // before the plan can complete. Drops are immediate; folds are
  // verified structurally against their designated targets, outstanding
  // ones forcing the next attempt with the fold instruction.
  const walkthrough = await runDeferredWalkthrough(deps, state, planDir);
  const current = {
    ...attempting,
    completionFolds: walkthrough.folds.length > 0 ? walkthrough.folds : undefined,
  };
  setState(current);
  if (walkthrough.refusal !== undefined) throw new Error(walkthrough.refusal);
  if (walkthrough.folds.length > 0) {
    throw new Error(foldInstructions(walkthrough.folds, discoverPlanDir(deps.fs, planDir)));
  }

  // The fresh-context verifier judges the durable records. Its gap
  // list is the refusal; its fulfillment is the completion's evidence.
  const scan = discoverPlanDir(deps.fs, planDir);
  const verdict = await deps.verifier.run({
    contract: composeCompletionContract(scan),
    changeDigest: changeDigest(deps),
  });
  if (!verdict.fulfilled) {
    const gaps = verdict.gaps.map((gap) => `- ${gap.trim()}`).join("\n");
    throw new Error(
      `reins_complete: the completion verifier found the contract unfulfilled.\n${gaps}`,
    );
  }

  const goalText = status.goal;
  const report =
    `Plan completed: ${goalText}. The contract is completed and the Completion entry is recorded in the plan log.`;
  await withFileMutationQueue(join(planDir, "plan.md"), async () => {
    // Fresh reads inside the queue; the records are one write step.
    writeFields(deps, "plan.md", { executionStatus: "completed" });
    prependLogEntry(deps, "Completion", `Plan completed: ${goalText}.`);
    const completed = transition(current, "completed");
    setState(completed);
    renderWidget(deps, completed, discoverPlanDir(deps.fs, planDir));
    deps.ui.notify(report, "info");
  });
  return result(report);
}

/** The disposition options of the walkthrough's fold-or-drop dialog, in order. */
export const WALKTHROUGH_OPTIONS = ["Fold", "Drop"] as const;

function proposalIdOf(proposal: ProposalDocument): string {
  return String(proposal.frontmatter.id ?? proposal.file);
}

/** What the walkthrough left behind: a refusal (if the plan cannot complete yet) and the outstanding folds. */
interface WalkthroughResult {
  /** Present when the walkthrough aborted or the plan cannot complete. */
  refusal?: string;
  /** The folds whose designated target has not verified yet. */
  folds: CompletionFold[];
}

/** The fold dialog's target input asks for a durable location. */
const FOLD_TARGET_TITLE = "durable target location";
const FOLD_TARGET_PLACEHOLDER =
  "Durable location to fold this proposal's content into (outside the plan directory)";

function foldTargetTitle(proposal: ProposalDocument): string {
  return `Fold proposal ${proposalIdOf(proposal)}: ${FOLD_TARGET_TITLE}`;
}

/** Whether the designated target would write inside the plan directory (legal only through the plugin). */
function isInsidePlanDir(target: string, planDir: string): boolean {
  const resolvedTarget = resolve(target);
  const resolvedPlan = resolve(planDir);
  return resolvedTarget === resolvedPlan || resolvedTarget.startsWith(resolvedPlan + sep);
}

/** Delete a proposal document as one mutation-queued step. */
async function deleteProposal(deps: ReinsDeps, planDir: string, file: string): Promise<void> {
  await withFileMutationQueue(join(planDir, file), async () => {
    if (deps.fs.exists(file)) deps.fs.delete(file);
  });
}

/**
 * The walkthrough: verify the outstanding folds structurally, then
 * walk every still-deferred proposal through one blocking fold-or-drop
 * dialog with the user. A verified fold (the designated target exists)
 * dispositions the proposal for good and deletes its document; a drop
 * deletes the proposal document immediately; a newly designated fold
 * records its target for the next attempt. Without an answer the
 * walkthrough aborts fail-closed: the drops so far stand, previously
 * designated folds stay recorded, and the plan cannot complete.
 */
async function runDeferredWalkthrough(
  deps: ReinsDeps,
  state: ReinsState,
  planDir: string,
): Promise<WalkthroughResult> {
  // Outstanding folds verify structurally, on this attempt: the fold
  // disposition completes when the designated target exists, and the
  // proposal document is deleted then.
  const folds: CompletionFold[] = [];
  for (const fold of state.completionFolds ?? []) {
    const scan = discoverPlanDir(deps.fs, planDir);
    const proposal = scan.proposals.find(
      (candidate) => candidate.file === fold.file || proposalIdOf(candidate) === fold.proposalId,
    );
    if (proposal === undefined) continue; // gone from the plan directory: nothing to verify
    if (existsSync(fold.target)) {
      await deleteProposal(deps, planDir, proposal.file);
      continue;
    }
    folds.push(fold);
  }

  // Still-deferred proposals (unverified folds included) walk through
  // the fold-or-drop dialog.
  const deferred = proposalStore(discoverPlanDir(deps.fs, planDir)).deferred();
  if (deferred.length === 0) return { folds };

  // Fail-closed: the walkthrough needs an interactive UI to disposition
  // with the user; refuse rather than auto-drop.
  const uiRefusal = requireUi(deps, "Completion walkthrough");
  if (uiRefusal !== null) return { refusal: uiRefusal, folds };

  for (const [index, proposal] of deferred.entries()) {
    const answer = await deps.ui.select(presentationOf(proposal), [...WALKTHROUGH_OPTIONS]);
    if (answer === "Drop") {
      await deleteProposal(deps, planDir, proposal.file);
      const designated = folds.findIndex((fold) => fold.file === proposal.file);
      if (designated !== -1) folds.splice(designated, 1);
      continue;
    }
    if (answer === "Fold") {
      const target = await deps.ui.input(foldTargetTitle(proposal), FOLD_TARGET_PLACEHOLDER);
      const trimmed = target?.trim() ?? "";
      if (trimmed === "") {
        return { refusal: interruptedRefusal(deferred, index), folds };
      }
      if (isInsidePlanDir(trimmed, planDir)) {
        return {
          refusal:
            `reins_complete: the fold target for proposal ${proposalIdOf(proposal)} must be outside the ` +
            "plan directory (the plan directory is written only through the plugin); " +
            "designate a durable location outside it.",
          folds,
        };
      }
      const designated = folds.findIndex((fold) => fold.file === proposal.file);
      const fold: CompletionFold = {
        proposalId: proposalIdOf(proposal),
        file: proposal.file,
        target: trimmed,
      };
      if (designated === -1) folds.push(fold);
      else folds[designated] = fold;
      continue;
    }
    return { refusal: interruptedRefusal(deferred, index), folds };
  }
  return { folds };
}

/** The interruption refusal: which deferred proposals are still unresolved. */
function interruptedRefusal(deferred: ProposalDocument[], from: number): string {
  const remaining = deferred.slice(from).map(proposalIdOf).join(", ");
  return (
    "reins_complete: the completion walkthrough was interrupted before every deferred proposal " +
    "was dispositioned; the plan cannot complete while deferred proposals are unresolved " +
    `(not dispositioned: ${remaining}).`
  );
}

/** The fold instruction returned to the model: what to write where, then attempt again. */
function foldInstructions(folds: CompletionFold[], scan: PlanScan): string {
  const byFile = new Map(scan.proposals.map((proposal) => [proposal.file, proposal]));
  const lines = folds.map((fold) => {
    const title = byFile.get(fold.file)?.frontmatter.title;
    const named = typeof title === "string" && title.trim() !== "" ? title : fold.proposalId;
    return `- Fold proposal ${fold.proposalId} (${named}) into ${fold.target}: ` +
      "write its content there (its rationale and any draft task content).";
  });
  const noun = folds.length === 1 ? "is folded but its content is not written yet" : "are folded but their content is not written yet";
  return (
    `reins_complete: ${folds.length} deferred proposal${folds.length === 1 ? "" : "s"} ${noun}. ` +
    "Write each one into its designated durable location with your normal tools " +
    "(the plan directory itself is written only through the plugin), then call reins_complete again:\n" +
    lines.join("\n")
  );
}

/**
 * The completion contract the verifier judges: the goal plus, per
 * task, the binding sections, the execution status, and the recorded
 * completion summary (the agent's claim of what was accomplished).
 */
function composeCompletionContract(scan: PlanScan): string {
  const goal = scan.plan?.frontmatter.goal;
  const lines = [`Goal: ${typeof goal === "string" ? goal : "(no goal)"}`, ""];
  for (const task of scan.tasks) {
    const id = String(task.frontmatter.id ?? task.file);
    const title = typeof task.frontmatter.title === "string" ? task.frontmatter.title : id;
    lines.push(`Task ${id}: ${title}`);
    lines.push(`Status: ${String(task.frontmatter.executionStatus ?? "unknown")}`);
    for (const [name, content] of [
      ["Description", task.binding.description],
      ["Acceptance Criteria", task.binding.acceptanceCriteria],
      ["Constraints", task.binding.constraints],
    ] as const) {
      if (content !== undefined) lines.push(`${name}:`, content);
    }
    const summary = task.frontmatter.completionSummary;
    if (typeof summary === "string" && summary.trim() !== "") {
      lines.push(`Completion summary: ${summary}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/**
 * The change digest sent to the verifier: the plan log's entry lines
 * (accepted revisions among them, per the closed entry vocabulary).
 */
function changeDigest(deps: ReinsDeps): string {
  if (!deps.fs.exists(LOG_FILE)) return "(no plan log)";
  const entries = deps.fs
    .read(LOG_FILE)
    .split("\n")
    .filter((line) => /^[*-]\s+\*\*\w+\*\*:/.test(line));
  return entries.length > 0 ? entries.join("\n") : "(no accepted revisions recorded)";
}

function result(text: string): TaskToolResult {
  return { content: [{ type: "text", text }], details: {} };
}

/** Build the completion tool definition over injected deps and state accessors. */
export function createCompleteTool(io: CompleteToolIo): ToolDefinition<any, any, any> {
  return {
    name: "reins_complete",
    label: "Complete the plan",
    description:
      "Declare the execution contract complete. The plugin checks the plan directory, walks every " +
      "deferred change proposal through a fold-or-drop dialog with the user, runs the fresh-context " +
      "completion verifier, and on fulfillment writes the Completion entry and completes the plan. " +
      "While any task is pending, in_progress, or blocked the attempt is refused with the " +
      "remaining-work list.",
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params: Record<string, unknown>, _signal, _onUpdate, ctx) =>
      planComplete(io.deps(ctx), io.state(), io.setState),
  };
}
