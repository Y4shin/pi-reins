/**
 * Renegotiation triggers and the batched proposal session.
 *
 * Triggers (arch spec, ticket 9): current-work bearing, imminent-work
 * entanglement at task start, exhaustion of eligible agreed work, and
 * initiative (the reins_renegotiate tool and the /reins-renegotiate
 * command). The session presents every pending proposal (deferred ones
 * included) one blocking approve/defer/reject dialog each, applies the
 * dispositions durably when the sweep completes, and terminates the run
 * at the gate. Driven through the shared harness seams.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../src/plan/discover.js";
import { openRenegotiationSession, shouldOpenSession } from "../src/handlers/renegotiate.js";
import type { ReinsState } from "../src/state.js";
import { createHarness, type ReinsHarness, type ToolOutcome } from "./harness/index.js";

const harnesses: ReinsHarness[] = [];

function makeHarness(options: Parameters<typeof createHarness>[0]): ReinsHarness {
  const h = createHarness(options);
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

const FIXED_NOW = () => "2026-10-01T12:00:00.000Z";

/** An executing state bound to the harness plan directory. */
function executingState(h: ReinsHarness): ReinsState {
  return { phase: "executing", planDir: h.planDir };
}

/** The terminate flag a tool result carries when the gate opened. */
function terminateOf(outcome: ToolOutcome): boolean {
  return (outcome.result as { terminate?: boolean } | undefined)?.terminate === true;
}

/** A modify proposal document body used across the sweep tests. */
const MODIFY_VERIFY_PROPOSAL = [
  "---",
  "type: Change Proposal",
  "id: cp-modify-verify",
  "kind: modify",
  "target: verify-result",
  "title: Narrow the verification",
  "---",
  "",
  "# Change Proposal: Narrow the verification",
  "",
  "## Rationale",
  "",
  "The full-suite comparison is redundant with the focused tests.",
  "",
].join("\n");

describe("shouldOpenSession: trigger evaluation", () => {
  test("current-work: a non-deferred proposal bearing on an in_progress task triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    // The fixture's proposal does not bear on any task; give it a
    // target so it bears on the task about to be in progress.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace("kind: add", "kind: add\ntarget: inspect-current-system"),
    );

    // No task is in progress yet: no trigger.
    const idle = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), idle, { kind: "current-work" })).toBe(false);

    // The bearing proposal triggers once the task is in progress.
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const active = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), active, { kind: "current-work" })).toBe(true);
  });

  test("current-work: deferred proposals never trigger a session", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace(
          "kind: add",
          "kind: add\ntarget: inspect-current-system\ndeferred: true",
        ),
    );
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "current-work" })).toBe(false);
    // Deliberate opening is still possible: initiative ignores deferrals.
    expect(shouldOpenSession(executingState(h), scan, { kind: "initiative" })).toBe(true);
  });

  test("task-start: a non-deferred proposal bearing on the started task triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(
      shouldOpenSession(executingState(h), scan, {
        kind: "task-start",
        taskId: "verify-result",
      }),
    ).toBe(false);

    h.writePlanFile(
      "proposals/cp-modify-verify.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-modify-verify",
        "kind: modify",
        "target: verify-result",
        'title: Narrow the verification',
        "---",
        "",
        "# Change Proposal: Narrow the verification",
        "",
        "## Rationale",
        "",
        "The full-suite comparison is redundant with the focused tests.",
        "",
      ].join("\n"),
    );
    const bearing = discoverPlanDir(h.deps.fs, h.planDir);
    expect(
      shouldOpenSession(executingState(h), bearing, {
        kind: "task-start",
        taskId: "verify-result",
      }),
    ).toBe(true);
    // Entanglement is per task: other starts are unaffected.
    expect(
      shouldOpenSession(executingState(h), bearing, {
        kind: "task-start",
        taskId: "inspect-current-system",
      }),
    ).toBe(false);
  });

  test("exhaustion: nothing startable with a non-deferred proposal pending triggers", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    // Work remains: no exhaustion.
    expect(shouldOpenSession(executingState(h), scan, { kind: "exhaustion" })).toBe(false);

    for (const file of [
      "100-inspect-current-system.md",
      "200-implement-change.md",
      "300-verify-result.md",
    ]) {
      h.writePlanFile(
        file,
        h.readPlanFile(file).replace("executionStatus: pending", "executionStatus: done"),
      );
    }
    const done = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), done, { kind: "exhaustion" })).toBe(true);

    // A deferred-only pending set never triggers.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace("kind: add", "kind: add\ndeferred: true"),
    );
    const deferredOnly = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), deferredOnly, { kind: "exhaustion" })).toBe(false);
  });

  test("exhaustion: a task still in progress means work is not exhausted", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    for (const file of ["200-implement-change.md", "300-verify-result.md"]) {
      h.writePlanFile(
        file,
        h.readPlanFile(file).replace("executionStatus: pending", "executionStatus: done"),
      );
    }
    h.writePlanFile(
      "100-inspect-current-system.md",
      h.readPlanFile("100-inspect-current-system.md").replace(
        "executionStatus: pending",
        "executionStatus: in_progress",
      ),
    );
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "exhaustion" })).toBe(false);
  });

  test("initiative triggers in executing and in no other phase", () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    const scan = discoverPlanDir(h.deps.fs, h.planDir);
    expect(shouldOpenSession(executingState(h), scan, { kind: "initiative" })).toBe(true);
    for (const phase of ["detached", "attached", "renegotiating", "plan-editing", "reviewing", "reconciling", "completed"] as const) {
      expect(shouldOpenSession({ phase, planDir: h.planDir }, scan, { kind: "initiative" })).toBe(false);
    }
    expect(shouldOpenSession({ phase: "executing" }, scan, { kind: "initiative" })).toBe(false);
  });
});

describe("reins_renegotiate: the initiative gate", () => {
  test("opens a session over the entire pending set, deferred items included", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Defer" },
    });
    await h.runCommand("reins-attach", "plan");
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);
    // A deferred proposal stays in the sweep; it just never triggers.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h
        .readPlanFile("proposals/cp-add-cli-migration.md")
        .replace("kind: add", "kind: add\ndeferred: true"),
    );

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(false);
    // One blocking dialog per pending proposal, the deferred one included.
    expect(h.ui.dialogs).toHaveLength(2);
    for (const dialog of h.ui.dialogs) {
      expect(dialog.kind).toBe("select");
      expect(dialog.options).toEqual(["Approve", "Defer", "Reject"]);
    }
    // The addition presents its rationale and its draft task content.
    const addDialog = h.ui.dialogs.find((d) => d.title.includes("cp-add-cli-migration"));
    expect(addDialog?.title).toContain("(add)");
    expect(addDialog?.title).toContain(
      "The current plan no longer suffices because the goal also covers the",
    );
    expect(addDialog?.title).toContain("migrate-cli-flags");
    expect(addDialog?.title).toContain("Migrate the CLI flag parsing onto the provider model.");
    // The modification presents its rationale and its target.
    const modifyDialog = h.ui.dialogs.find((d) => d.title.includes("cp-modify-verify"));
    expect(modifyDialog?.title).toContain("(modify)");
    expect(modifyDialog?.title).toContain("verify-result");
    expect(modifyDialog?.title).toContain(
      "The full-suite comparison is redundant with the focused tests.",
    );

    // The gate opened: the run terminates after the tool call.
    expect(terminateOf(outcome)).toBe(true);
    // The gate state appeared on the widget, and the sweep returned to executing.
    const rendered = h.ui.widgets.map((w) => (w.lines ?? []).join("\n"));
    expect(rendered.some((text) => text.includes("Gate: renegotiating"))).toBe(true);
    expect(rendered[rendered.length - 1]).toContain("Gate: executing");
    expect(outcome.message).toMatch(/renegotiation session/i);
  });

  test("without an interactive UI the session blocks fail-closed", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, hasUI: false });
    await h.runCommand("reins-attach", "plan");
    const filesBefore = h.planFiles();

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("interactive UI");
    // No dialog was shown, nothing durable changed, nothing rendered.
    expect(h.ui.dialogs).toEqual([]);
    expect(h.planFiles()).toEqual(filesBefore);
    expect(h.ui.widgets).toEqual([]);
    // The session never opened, so no gate state was recorded.
    expect(h.session.entries).toEqual([
      { customType: "reins-attached", data: { planDir: h.planDir, phase: "executing" } },
    ]);
  });

  test("with no pending proposals the tool refuses", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");
    rmSync(join(h.planDir, "proposals"), { recursive: true, force: true });

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("no pending change proposals");
    expect(h.ui.dialogs).toEqual([]);
  });

  test("answers record approve, defer, and reject as durable dispositions", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: {
        select: (title) =>
          title.includes("cp-add-cli-migration")
            ? "Approve"
            : title.includes("cp-modify-verify")
              ? "Defer"
              : "Reject",
      },
    });
    await h.runCommand("reins-attach", "plan");
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);
    h.writePlanFile(
      "proposals/cp-remove-implement.md",
      [
        "---",
        "type: Change Proposal",
        "id: cp-remove-implement",
        "kind: remove",
        "target: implement-change",
        "---",
        "",
        "# Change Proposal: Drop the implementation task",
        "",
        "## Rationale",
        "",
        "The provider loader already exists in the codebase baseline.",
        "",
      ].join("\n"),
    );

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(false);
    // The deferred proposal carries the deferred marker.
    const modified = h.readPlanFile("proposals/cp-modify-verify.md");
    expect(modified).toContain("deferred: true");
    // The rejected proposal is deleted when the renegotiating state ends.
    expect(h.planFiles().some((f) => f === "proposals/cp-remove-implement.md")).toBe(false);
    // The approved proposal stays pending until review acceptance.
    expect(h.planFiles().some((f) => f === "proposals/cp-add-cli-migration.md")).toBe(true);
    // An approval moves the contract toward plan editing.
    const rendered = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(rendered).toContain("Gate: plan-editing");
    expect(rendered).toContain("Proposals: 2 pending, 1 deferred");
    const status = await h.dispatchTool("reins_status");
    expect(status.isError).toBe(true);
    expect(status.message).toContain("plan-editing");
  });

  test("a sweep with no approval returns to executing with deferrals recorded", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Defer" },
    });
    await h.runCommand("reins-attach", "plan");
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(false);
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("deferred: true");
    expect(h.readPlanFile("proposals/cp-modify-verify.md")).toContain("deferred: true");
    const rendered = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(rendered).toContain("Gate: executing");
    expect(rendered).toContain("Proposals: 2 pending, 2 deferred");
    // Execution continues: the task tools still answer.
    const status = await h.dispatchTool("reins_status");
    expect(status.isError).toBe(false);
  });

  test("a sweep that rejects everything clears the pending set and returns to executing", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Reject" },
    });
    await h.runCommand("reins-attach", "plan");
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(false);
    expect(h.planFiles().some((f) => f.startsWith("proposals/"))).toBe(false);
    const rendered = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(rendered).toContain("Gate: executing");
    expect(rendered).not.toContain("Proposals:");
  });

  test("the session terminates the run at the gate and the current task stays in_progress", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Defer" },
    });
    await h.runCommand("reins-attach", "plan");
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });

    const outcome = await h.dispatchTool("reins_renegotiate");

    expect(outcome.isError).toBe(false);
    expect(terminateOf(outcome)).toBe(true);
    // The gate never touches the current task: it stays in progress.
    expect(h.readPlanFile("100-inspect-current-system.md")).toContain(
      "executionStatus: in_progress",
    );
  });

  test("entering plan-editing swaps edit and write out of the active tool set", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Approve" },
    });
    await h.runCommand("reins-attach", "plan");
    h.toolset.active = ["read", "edit", "write", "bash", "reins_status"];

    await h.dispatchTool("reins_renegotiate");

    // Raw plan-editing is out; everything else stays reachable.
    expect(h.toolset.active).toEqual(["read", "bash", "reins_status"]);
  });

  test("a sweep without approvals does not touch the tool set", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Defer" },
    });
    await h.runCommand("reins-attach", "plan");
    h.toolset.active = ["read", "edit", "write", "bash"];

    await h.dispatchTool("reins_renegotiate");

    expect(h.toolset.active).toEqual(["read", "edit", "write", "bash"]);
  });
});

describe("openRenegotiationSession: the session result contract", () => {
  test("the result carries approved intents by kind and target plus the pre-session snapshot", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Approve" },
    });
    const planBefore = h.readPlanFile("plan.md");

    const { state, result } = await openRenegotiationSession(
      h.deps,
      { phase: "executing", planDir: h.planDir },
      { kind: "initiative" },
    );

    expect(result.kind).toBe("completed");
    expect(state.phase).toBe("plan-editing");
    expect(result.terminateRun).toBe(true);
    expect(result.approved).toStrictEqual([
      { proposalId: "cp-add-cli-migration", kind: "add" },
    ]);
    expect(result.deferred).toStrictEqual([]);
    expect(result.rejected).toStrictEqual([]);
    // The snapshot handle: the plan directory as it stood before the sweep.
    expect(result.snapshot?.root).toBe(h.planDir);
    expect(result.snapshot?.files.get("plan.md")).toBe(planBefore);
    expect(result.snapshot?.files.has("proposals/cp-add-cli-migration.md")).toBe(true);
    expect(result.snapshot?.files.has("100-inspect-current-system.md")).toBe(true);
  });

  test("the snapshot predates the dispositions: rejected content survives in it", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: {
        select: (title) => (title.includes("cp-add-cli-migration") ? "Approve" : "Reject"),
      },
    });
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);
    const modifyBefore = h.readPlanFile("proposals/cp-modify-verify.md");

    const { result } = await openRenegotiationSession(
      h.deps,
      { phase: "executing", planDir: h.planDir },
      { kind: "initiative" },
    );

    // The rejected document is gone from disk...
    expect(h.planFiles().some((f) => f === "proposals/cp-modify-verify.md")).toBe(false);
    // ...but its pre-session content is preserved in the snapshot, and
    // the approved intent names its kind and target.
    expect(result.snapshot?.files.get("proposals/cp-modify-verify.md")).toBe(modifyBefore);
    expect(result.approved).toStrictEqual([
      { proposalId: "cp-add-cli-migration", kind: "add" },
    ]);
    expect(result.rejected).toStrictEqual(["cp-modify-verify"]);
  });

  test("an approved modify intent names its target task", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: {
        select: (title) => (title.includes("cp-modify-verify") ? "Approve" : "Defer"),
      },
    });
    h.writePlanFile("proposals/cp-modify-verify.md", MODIFY_VERIFY_PROPOSAL);

    const { result } = await openRenegotiationSession(
      h.deps,
      { phase: "executing", planDir: h.planDir },
      { kind: "initiative" },
    );

    expect(result.approved).toStrictEqual([
      { proposalId: "cp-modify-verify", kind: "modify", target: "verify-result" },
    ]);
    expect(result.deferred).toStrictEqual(["cp-add-cli-migration"]);
  });

  test("the gate records open and closed session entries and forces steering", async () => {
    const h = makeHarness({
      planDir: "plan-active",
      now: FIXED_NOW,
      uiScript: { select: "Defer" },
    });
    await h.runCommand("reins-attach", "plan");

    await h.dispatchTool("reins_renegotiate");

    const types = h.session.entries.map((entry) => entry.customType);
    expect(types).toContain("reins-gate-open");
    expect(types).toContain("reins-gate-closed");
    const open = h.session.entries.find((entry) => entry.customType === "reins-gate-open");
    expect(open?.data).toMatchObject({ planDir: h.planDir, phase: "renegotiating", cause: "initiative" });
    const closed = h.session.entries.find((entry) => entry.customType === "reins-gate-closed");
    expect(closed?.data).toMatchObject({
      planDir: h.planDir,
      phase: "executing",
      approved: [],
      deferred: ["cp-add-cli-migration"],
      rejected: [],
      abandoned: false,
    });
    // Gate transitions force a steering injection.
    expect(h.steering.forced).toHaveLength(2);
    for (const trigger of h.steering.forced) {
      expect(trigger.reason).toBe("gate-transition");
    }
  });
});
