/**
 * The concrete review gate: the blocking dialog that presents the
 * revision the plan-editing tools produced, as the difference between
 * the pre-session snapshot and the post-edit plan directory.
 *
 * Accept makes the revision authoritative: the plan revision is
 * bumped, the log Update entry and the `verified` event are written
 * together by the same writer (fs-contract, Generated and Verified),
 * the applied proposal documents are deleted (the renegotiation
 * session deliberately kept them pending until here), and executing
 * resumes with the tool set restored. Reject returns to plan-editing
 * with the materialized content kept. Abandon restores the
 * pre-session snapshot for the contract content, leaves the proposal
 * documents and their gate-1 dispositions untouched, returns to
 * executing, and restores the tool set.
 *
 * The review is fail-closed: it refuses before entering reviewing
 * when no interactive UI exists, and a dismissed dialog holds the
 * reviewing phase (nothing durable, no auto-accept) until
 * `reins_finish_revision` is called again.
 */

import { join } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import type { ReinsDeps, FsPort } from "../deps.js";
import { discoverPlanDir } from "../plan/discover.js";
import { extractBindingSections, parseDoc, type BindingSections } from "../plan/parse.js";
import { appendVerifiedEvent, prependLogEntry, writeFields } from "../plan/write.js";
import { recordContractWrite, transition, type PlanEditingContext, type ReinsPhase, type ReinsState } from "../state.js";
import type { PlanSnapshot } from "../plan/fingerprint.js";
import { requireUi } from "../ui/dialogs.js";
import { renderWidget } from "../ui/widget.js";

/** The review dialog's answers, in order. */
export const REVIEW_OPTIONS = ["Accept", "Reject", "Abandon"] as const;

/** How the review dialog resolved. */
export type ReviewOutcomeKind = "accepted" | "rejected" | "abandoned" | "dismissed" | "refused";

/** The gate's result: outcome kind, resulting phase, and the report line. */
export interface ReviewOutcome {
  kind: ReviewOutcomeKind;
  /** The phase after the dialog; undefined only for a refused gate. */
  phase?: ReinsPhase;
  report: string;
}

/** One binding section as the diff presents it. */
export interface DiffSection {
  name: string;
  /** The section's content in the post-edit state. */
  content: string;
}

interface DiffTask {
  file: string;
  id: string;
  title: string;
}

/** The review diff: what the revision changed in the contract's tasks. */
export interface RevisionDiff {
  added: Array<DiffTask & { sections: BindingSections }>;
  removed: DiffTask[];
  changed: Array<DiffTask & { changes: string[]; sections: DiffSection[] }>;
}

/** A task document parsed out of snapshot content, or out of a scan. */
interface DiffSource {
  file: string;
  id: string;
  title: string;
  binding: BindingSections;
}

function idOf(task: { frontmatter: Record<string, unknown>; file: string }): string {
  return String(task.frontmatter.id ?? task.file);
}

function titleOf(task: { frontmatter: Record<string, unknown>; file: string }): string {
  const title = task.frontmatter.title;
  return typeof title === "string" && title.trim() !== "" ? title : idOf(task);
}

/** Parse one raw file as a task document, or undefined when it is not one. */
function taskFromContent(file: string, content: string): DiffSource | undefined {
  const { doc } = parseDoc(content, file);
  if (doc === null || doc.frontmatter.type !== "Task") return undefined;
  return {
    file,
    id: idOf(doc),
    title: titleOf(doc),
    binding: extractBindingSections(doc.body).binding,
  };
}

function bindingIsEmpty(binding: BindingSections): boolean {
  return (
    binding.description === undefined &&
    binding.acceptanceCriteria === undefined &&
    binding.constraints === undefined
  );
}

/**
 * The concrete review diff: the tasks the revision added, removed, and
 * changed, computed between the pre-session snapshot and a fresh scan.
 * Status-only frontmatter is not contract content and shows only when
 * a binding section or the title actually changed.
 */
export function revisionDiff(snapshot: PlanSnapshot, fs: FsPort, planDir: string): RevisionDiff {
  const fromSnapshot = new Map<string, DiffSource>();
  for (const [file, content] of snapshot.files) {
    if (file === "plan.md" || file.startsWith("proposals/")) continue;
    const doc = file.endsWith(".md") ? taskFromContent(file, content) : undefined;
    if (doc !== undefined && !bindingIsEmpty(doc.binding)) fromSnapshot.set(file, doc);
  }

  const scan = discoverPlanDir(fs, planDir);
  const current = new Map<string, DiffSource>();
  for (const task of scan.tasks) {
    current.set(task.file, {
      file: task.file,
      id: idOf(task),
      title: titleOf(task),
      binding: task.binding,
    });
  }

  const added: RevisionDiff["added"] = [];
  const removed: DiffTask[] = [];
  const changed: RevisionDiff["changed"] = [];

  for (const [file, task] of current) {
    const before = fromSnapshot.get(file);
    if (before === undefined) {
      added.push({ ...task, sections: task.binding });
      continue;
    }
    const changes: string[] = [];
    const sections: DiffSection[] = [];
    if (before.title !== task.title) changes.push("title changed");
    for (const [name, key, label] of [
      ["description", "description", "Description"],
      ["acceptanceCriteria", "acceptanceCriteria", "Acceptance Criteria"],
      ["constraints", "constraints", "Constraints"],
    ] as const) {
      const beforeSection = before.binding[key];
      const afterSection = task.binding[key];
      if (beforeSection !== afterSection) {
        changes.push(`${label} changed`);
        if (afterSection !== undefined) sections.push({ name: label, content: afterSection });
      }
    }
    if (changes.length > 0) changed.push({ ...task, changes, sections });
  }
  for (const [file, task] of fromSnapshot) {
    if (!current.has(file)) removed.push(task);
  }

  return { added, removed, changed };
}

/** The dialog content: the concrete revision, as the diff from the pre-session plan. */
export function reviewPresentation(diff: RevisionDiff): string {
  const lines: string[] = ["Plan revision review"];

  if (diff.added.length > 0) {
    lines.push("", "Added tasks:");
    for (const task of diff.added) {
      lines.push(`- ${task.file}: ${task.id} - ${task.title}`);
      for (const [name, key] of [
        ["Description", "description"],
        ["Acceptance Criteria", "acceptanceCriteria"],
        ["Constraints", "constraints"],
      ] as const) {
        const content = task.sections[key];
        if (content !== undefined && content.trim() !== "") lines.push(`    ${name}: ${content}`);
      }
    }
  }
  if (diff.removed.length > 0) {
    lines.push("", "Removed tasks:");
    for (const task of diff.removed) lines.push(`- ${task.file}: ${task.id} - ${task.title}`);
  }
  if (diff.changed.length > 0) {
    lines.push("", "Changed tasks:");
    for (const task of diff.changed) {
      lines.push(`- ${task.file}: ${task.id} - ${task.title}`);
      for (const change of task.changes) lines.push(`    ${change}`);
      for (const section of task.sections) {
        lines.push(`    Now ${section.name}:`, ...section.content.split("\n").map((line) => `      ${line}`));
      }
    }
  }
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    lines.push("", "No task content changed relative to the pre-session plan.");
  }

  lines.push(
    "",
    "Accept the revision as the execution contract? " +
      "Reject returns to plan editing; abandon restores the pre-session plan.",
  );
  return lines.join("\n");
}

/** The log Update entry's summary of what the revision changed. */
function revisionSummary(diff: RevisionDiff): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`added ${diff.added.map((task) => task.id).join(", ")}`);
  if (diff.removed.length > 0) parts.push(`removed ${diff.removed.map((task) => task.id).join(", ")}`);
  if (diff.changed.length > 0) parts.push(`changed ${diff.changed.map((task) => task.id).join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "no contract content changes";
}

/**
 * Restore the pre-session snapshot for the contract content. Proposal
 * documents and the dispositions the renegotiation gate applied to
 * them (deferred markers, rejections) are gate-1 decisions and are not
 * revisited by the review gate's abandon; everything else returns to
 * its snapshot content, files the revision added are deleted.
 */
function restoreSnapshot(deps: ReinsDeps, snapshot: PlanSnapshot): void {
  const current = new Set(deps.fs.list());
  for (const [file, content] of snapshot.files) {
    if (file.startsWith("proposals/")) continue;
    if (!deps.fs.exists(file) || deps.fs.read(file) !== content) deps.fs.write(file, content);
  }
  for (const file of current) {
    if (file.startsWith("proposals/")) continue;
    if (!snapshot.files.has(file)) deps.fs.delete(file);
  }
}

/** The review gate's guard result: the context and phase to continue from. */
interface ReviewEntry {
  planDir: string;
  planEditing: PlanEditingContext;
  phase: ReinsState;
}

function requireReviewable(state: ReinsState, toolName: string): ReviewEntry {
  const inPhase = state.phase === "plan-editing" || state.phase === "reviewing";
  if (!inPhase || state.planDir === undefined || state.planEditing === undefined) {
    throw new Error(`${toolName}: the contract is not in plan editing (phase: ${state.phase}).`);
  }
  return { planDir: state.planDir, planEditing: state.planEditing, phase: state };
}

/**
 * Run the review gate. Transitions plan-editing to reviewing, presents
 * the concrete diff, and applies the answer. Returns the resulting
 * state and outcome; the caller propagates the state.
 */
export async function finishRevisionReview(
  deps: ReinsDeps,
  state: ReinsState,
  setState: (state: ReinsState) => void,
): Promise<{ state: ReinsState; result: ReviewOutcome }> {
  const entry = requireReviewable(state, "reins_finish_revision");
  const { planDir, planEditing } = entry;

  // Fail-closed: the review dialog needs an interactive UI; refuse
  // before entering reviewing so the phases never dead-end without it.
  const uiRefusal = requireUi(deps, "Revision review");
  if (uiRefusal !== null) {
    return { state, result: { kind: "refused", report: uiRefusal } };
  }

  let phase = state;
  if (phase.phase === "plan-editing") {
    phase = transition(phase, "reviewing");
    setState(phase);
    deps.steering.forceInject("gate-transition", "Revision submitted; the concrete review gate is open.");
    renderWidget(deps, phase, discoverPlanDir(deps.fs, planDir));
  }

  const diff = revisionDiff(planEditing.snapshot, deps.fs, planDir);
  const answer = await deps.ui.select(reviewPresentation(diff), [...REVIEW_OPTIONS]);

  if (answer === "Accept") {
    const accepted = await acceptRevision(deps, phase, setState, planEditing, planDir, diff);
    return accepted;
  }
  if (answer === "Reject") {
    const rejected = transition(phase, "plan-editing");
    setState(rejected);
    deps.steering.forceInject("gate-transition", "Revision rejected; plan editing resumes.");
    renderWidget(deps, rejected, discoverPlanDir(deps.fs, planDir));
    return {
      state: rejected,
      result: {
        kind: "rejected",
        phase: "plan-editing",
        report:
          "Revision rejected; the contract returned to plan editing. " +
          "Revise and call reins_finish_revision again.",
      },
    };
  }
  if (answer === "Abandon") {
    // Restore the contract first, then leave the gate: entering
    // executing re-arms the drift baseline over the restored content.
    restoreSnapshot(deps, planEditing.snapshot);
    deps.toolset.setActiveTools(planEditing.tools);
    const abandoned = transition(phase, "executing");
    setState({ ...abandoned, planEditing: undefined });
    deps.steering.forceInject(
      "gate-transition",
      "Revision abandoned; the pre-session plan was restored and executing resumed.",
    );
    renderWidget(deps, abandoned, discoverPlanDir(deps.fs, planDir));
    const report =
      "Revision abandoned: the pre-session plan was restored, the proposals stay pending, " +
      "and executing resumed.";
    deps.ui.notify(report, "info");
    return { state: { ...abandoned, planEditing: undefined }, result: { kind: "abandoned", phase: "executing", report } };
  }

  // Dismissed or unrecognized: hold reviewing fail-closed. Nothing is
  // durable, nothing is auto-accepted; the gate is re-offered on the
  // next reins_finish_revision call.
  const report =
    "No review decision was recorded; the contract stays in reviewing. " +
    "Call reins_finish_revision to present the revision again.";
  deps.ui.notify(report, "warning");
  return { state: phase, result: { kind: "dismissed", phase: phase.phase, report } };
}

/**
 * The acceptance write: the revision bump, the log Update entry and
 * the `verified` event together (same writer), the applied proposal
 * documents' deletion, the tool set restore, and the return to
 * executing.
 */
async function acceptRevision(
  deps: ReinsDeps,
  phase: ReinsState,
  setState: (state: ReinsState) => void,
  planEditing: PlanEditingContext,
  planDir: string,
  diff: RevisionDiff,
): Promise<{ state: ReinsState; result: ReviewOutcome }> {
  const scan = discoverPlanDir(deps.fs, planDir);
  await withFileMutationQueue(join(planDir, "plan.md"), async () => {
    // Fresh read inside the queue; the whole acceptance is one step.
    const fresh = discoverPlanDir(deps.fs, planDir);
    const revision =
      typeof fresh.plan?.frontmatter.revision === "number" ? fresh.plan.frontmatter.revision : 0;
    const next = revision + 1;
    writeFields(deps, "plan.md", { revision: next });
    // The log Update entry and the verified event are written together
    // by this writer (fs-contract, Generated and Verified).
    appendVerifiedEvent(deps, "plan.md", deps.actor);
    prependLogEntry(deps, "Update", `Revision ${next} accepted. ${revisionSummary(diff)}.`);
    // The approved proposals were kept pending until this acceptance;
    // the revision is authorized, so their documents are deleted now.
    for (const intent of planEditing.approved) {
      const file = `proposals/${intent.proposalId}.md`;
      if (deps.fs.exists(file)) deps.fs.delete(file);
    }
  });
  // Record the acceptance's contract writes for the drift monitor.
  recordContractWrite(phase, setState, "plan.md");
  recordContractWrite(phase, setState, "log.md");

  deps.toolset.setActiveTools(planEditing.tools);
  const resumed = transition(phase, "executing");
  const finalState = { ...resumed, planEditing: undefined };
  setState(finalState);
  deps.steering.forceInject(
    "gate-transition",
    "Revision accepted; the contract returned to executing on the revised plan.",
  );
  renderWidget(deps, finalState, discoverPlanDir(deps.fs, planDir));
  const report =
    "Revision accepted: the contract returned to executing on the revised plan. " +
    "The applied proposals were resolved; deferred ones stay pending.";
  deps.ui.notify(report, "info");
  return { state: finalState, result: { kind: "accepted", phase: "executing", report } };
}
