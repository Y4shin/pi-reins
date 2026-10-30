/**
 * Plan completion, end to end: the deferred-proposal walkthrough, the
 * fresh-context completion verifier, and the durable completion
 * records.
 *
 * The structural guard (remaining-work refusals) is covered on the
 * completion-guard ticket; this file covers everything past it: the
 * walkthrough folds or drops every deferred proposal before the plan
 * can complete, the verifier's verdict decides between the gap-list
 * refusal and the records, and completion writes the Completion log
 * entry and flips the plan to completed.
 *
 * Driven through the shared harness seams: the tool boundary (attempt
 * outcomes, durable file effects), the UI port (scripted walkthrough
 * dialogs), and the captured verifier requests.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createHarness, type HarnessOptions, type ReinsHarness, type UiScript } from "./harness/index.js";

const harnesses: ReinsHarness[] = [];

function makeHarness(options: HarnessOptions): ReinsHarness {
  const h = createHarness(options);
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

const FIXED_NOW = () => "2026-10-01T12:00:00.000Z";

/** The active fixture's tasks, in file order. */
const TASK_IDS = ["inspect-current-system", "implement-change", "verify-result"];

/** Mark the fixture's proposal deferred so no renegotiation trigger fires. */
function deferProposal(h: ReinsHarness): void {
  const file = "proposals/cp-add-cli-migration.md";
  h.writePlanFile(file, h.readPlanFile(file).replace("kind: add", "kind: add\ndeferred: true"));
}

/** Run the lifecycle up to the completion attempt: attach, defer, finish every task. */
async function completeTasks(h: ReinsHarness): Promise<void> {
  await h.runCommand("reins-attach", "plan");
  deferProposal(h);
  for (const taskId of TASK_IDS) {
    await h.dispatchTool("reins_task_start", { taskId });
    await h.dispatchTool("reins_task_complete", { taskId, completionSummary: `Did ${taskId}: focused checks pass.` });
  }
}

/**
 * A harness with the contract executing and every task done: the state
 * the completion attempt starts from. The fixture proposal is deferred
 * so the walkthrough owns its disposition.
 */
async function readyToComplete(uiScript?: UiScript, verifier?: HarnessOptions["verifier"]) {
  const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, uiScript, verifier });
  await completeTasks(h);
  return h;
}

describe("reins_complete: the deferred-proposal walkthrough", () => {
  test("a consciously dropped deferred proposal completes the plan in one attempt", async () => {
    const h = await readyToComplete({
      select: (title) => (title.includes("Migrate the CLI flags") ? "Drop" : undefined),
    });

    const outcome = await h.dispatchTool("reins_complete");

    // The walkthrough decided, the drop was immediate, and the attempt
    // proceeded through the verifier to the records.
    expect(outcome.isError).toBe(false);
    expect(() => h.readPlanFile("proposals/cp-add-cli-migration.md")).toThrow();
    expect(h.verifier.requests).toHaveLength(1);
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: completed");
    expect(h.readPlanFile("log.md")).toMatch(/\*\*Completion\*\*: Plan completed/);
    const widget = h.ui.widgets.at(-1);
    expect(widget?.lines).toContain("Gate: completed");
  });

  test("a fold designates a durable target and the attempt refuses with the fold instruction", async () => {
    let foldTarget = ""; // assigned once the harness root exists
    const h = await readyToComplete({
      select: (title) => (title.includes("Migrate the CLI flags") ? "Fold" : undefined),
      input: (title) => (title.includes("durable target") ? foldTarget : undefined),
    });
    foldTarget = join(h.root, "notes", "deferred-ideas.md");

    const outcome = await h.dispatchTool("reins_complete");

    // The fold is designated, not yet written: the attempt refuses with
    // the fold instruction naming the proposal and the target.
    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("cp-add-cli-migration");
    expect(outcome.message).toContain(foldTarget);
    // The deferred proposal document stays until the fold verifies.
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("deferred: true");
    expect(h.readPlanFile("log.md")).not.toMatch(/\*\*Completion\*\*/);
    // No verifier run: the walkthrough's outstanding fold blocks it.
    expect(h.verifier.requests).toHaveLength(0);
  });

  test("a written fold verifies on the next attempt and deletes the dispositioned proposal", async () => {
    let foldTarget = "";
    const h = await readyToComplete({
      select: (title) => (title.includes("Migrate the CLI flags") ? "Fold" : undefined),
      input: (title) => (title.includes("durable target") ? foldTarget : undefined),
    });
    foldTarget = join(h.root, "notes", "deferred-ideas.md");
    const first = await h.dispatchTool("reins_complete");
    expect(first.isError).toBe(true);

    // The agent writes the designated target with its normal tools
    // (outside the plan directory), then attempts completion again.
    mkdirSync(dirname(foldTarget), { recursive: true });
    writeFileSync(foldTarget, "Migrate the CLI flags: rationale and draft task content.\n");
    const second = await h.dispatchTool("reins_complete");

    expect(second.isError).toBe(false);
    // The verified fold dispositioned the proposal: its document is deleted.
    expect(() => h.readPlanFile("proposals/cp-add-cli-migration.md")).toThrow();
    expect(h.verifier.requests).toHaveLength(1);
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: completed");
    expect(h.readPlanFile("log.md")).toMatch(/\*\*Completion\*\*/);
  });

  test("an outstanding fold that was never written is re-presented on the next attempt", async () => {
    let foldTarget = "";
    let selectCalls = 0;
    const h = await readyToComplete({
      select: (title) => {
        if (!title.includes("Migrate the CLI flags")) return undefined;
        selectCalls += 1;
        return selectCalls === 1 ? "Fold" : "Drop";
      },
      input: (title) => (title.includes("durable target") ? foldTarget : undefined),
    });
    foldTarget = join(h.root, "notes", "deferred-ideas.md");
    const first = await h.dispatchTool("reins_complete");
    expect(first.isError).toBe(true);

    const second = await h.dispatchTool("reins_complete");

    // The proposal was re-presented (the fold did not verify); the
    // user's new answer drops it and completion proceeds.
    expect(second.isError).toBe(false);
    expect(selectCalls).toBe(2);
    expect(() => h.readPlanFile("proposals/cp-add-cli-migration.md")).toThrow();
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: completed");
  });

  test("a dismissed walkthrough refuses and the plan cannot complete", async () => {
    const h = await readyToComplete();

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("not dispositioned: cp-add-cli-migration");
    // Nothing was auto-dispositioned and the plan did not complete.
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("deferred: true");
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: active");
    expect(h.verifier.requests).toHaveLength(0);
  });

  test("a dismissed fold designation aborts with the earlier drop standing", async () => {
    const h = await readyToComplete({
      select: (title) => {
        if (title.includes("Migrate the CLI flags")) return "Drop";
        if (title.includes("cp-z-parked")) return "Fold";
        return undefined;
      },
      // The fold designation is never answered: the walkthrough aborts.
      input: () => undefined,
    });
    // A second deferred proposal, sorted after the fixture's.
    h.writePlanFile(
      "proposals/cp-z-parked.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-z-parked",
        "kind: modify",
        "target: verify-result",
        "title: Park the sizing question",
        "deferred: true",
        "---",
        "",
        "# Change Proposal: Park the sizing question",
        "",
        "## Rationale",
        "",
        "The sizing decision should wait for the profiling results.",
        "",
      ].join("\n"),
    );

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("not dispositioned: cp-z-parked");
    // The immediate drop stands; the folded item stays deferred on disk.
    expect(() => h.readPlanFile("proposals/cp-add-cli-migration.md")).toThrow();
    expect(h.readPlanFile("proposals/cp-z-parked.md")).toContain("deferred: true");
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: active");
  });

  test("a fold target inside the plan directory is refused", async () => {
    const h = await readyToComplete({
      select: (title) => (title.includes("Migrate the CLI flags") ? "Fold" : undefined),
      input: (title) => (title.includes("durable target") ? join(h.planDir, "folded.md") : undefined),
    });

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("outside the plan directory");
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("deferred: true");
  });

  test("without an interactive UI the walkthrough refuses fail-closed", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, hasUI: false });
    await completeTasks(h);

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("needs an interactive UI");
    // Nothing was dispositioned and no dialog was attempted.
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("deferred: true");
    expect(h.ui.dialogs).toEqual([]);
  });
});

describe("reins_complete: the completion verifier", () => {
  test("the verifier judges the durable records: the contract and the change digest", async () => {
    const h = await readyToComplete({ select: () => "Drop" });

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(false);
    expect(h.verifier.requests).toHaveLength(1);
    const request = h.verifier.requests[0];
    // The contract carries the goal, the tasks, and their completion summaries.
    expect(request.contract).toContain("Migrate configuration loading to the new provider model");
    expect(request.contract).toContain("Task verify-result");
    expect(request.contract).toContain("Did verify-result: focused checks pass.");
    // The digest carries the plan log's records.
    expect(request.changeDigest).toContain("**Activation**");
  });

  test("a gap verdict is the refusal, with the gaps named", async () => {
    const gaps = ["verify-result: the before-and-after comparison is not in the summary", "implement-change: the focused tests were not named"];
    const h = await readyToComplete(
      { select: () => "Drop" },
      { run: async () => ({ fulfilled: false, gaps }) },
    );

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    for (const gap of gaps) expect(outcome.message).toContain(gap);
    // The refusal leaves everything durable untouched.
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: active");
    expect(h.readPlanFile("log.md")).not.toMatch(/\*\*Completion\*\*/);
  });

  test("a verifier failure surfaces as a refusal naming the failure", async () => {
    const h = await readyToComplete(
      { select: () => "Drop" },
      { run: async () => { throw new Error("the reins-completion-verifier agent could not be spawned"); } },
    );

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("could not be spawned");
    expect(h.readPlanFile("plan.md")).toContain("executionStatus: active");
  });

  test("a clean, verified completion leaves the contract completed and refusal-locked", async () => {
    const h = await readyToComplete({ select: () => "Drop" });
    const outcome = await h.dispatchTool("reins_complete");
    expect(outcome.isError).toBe(false);

    const after = await h.dispatchTool("reins_status");

    expect(after.isError).toBe(true);
    expect(after.message).toContain("phase: completed");
  });
});
