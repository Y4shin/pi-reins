/**
 * Task lifecycle tools: start, complete, block, status, and progress
 * recording, driven through the tool boundary of the shared harness.
 *
 * These tools are the only write path into task execution state: every
 * successful transition is durable frontmatter in the plan directory
 * (stamped `generated`), every refusal names what is missing, and the
 * widget is re-rendered after each transition. Raw writes into the plan
 * directory are blocked by the tool_call guard, tested separately below.
 */

import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";

import { createHarness, type ReinsHarness } from "./harness/index.js";

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

/** Parse the frontmatter mapping of a plan-directory document. */
function frontmatterOf(text: string): Record<string, unknown> {
  return YAML.parse(text.split("---\n")[1]) as Record<string, unknown>;
}

/** A harness attached to the active fixture: the contract is executing. */
async function executingHarness(): Promise<ReinsHarness> {
  const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
  await h.runCommand("reins-attach", "plan");
  return h;
}

describe("reins_task_start", () => {
  test("marks a pending task in_progress durably with a one-line result", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("inspect-current-system");
    expect(outcome.message.split("\n")).toHaveLength(1);

    const task = frontmatterOf(h.readPlanFile("100-inspect-current-system.md"));
    expect(task.executionStatus).toBe("in_progress");
  });

  test("refuses a task that is already in_progress, done, or unknown", async () => {
    const h = await executingHarness();

    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    const again = await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    expect(again.isError).toBe(true);
    expect(again.message).toContain("already in_progress");

    h.writePlanFile(
      "300-verify-result.md",
      h
        .readPlanFile("300-verify-result.md")
        .replace("executionStatus: pending", "executionStatus: done"),
    );
    const done = await h.dispatchTool("reins_task_start", { taskId: "verify-result" });
    expect(done.isError).toBe(true);
    expect(done.message).toContain("already done");

    const unknown = await h.dispatchTool("reins_task_start", { taskId: "no-such-task" });
    expect(unknown.isError).toBe(true);
    expect(unknown.message).toContain("no task with id \"no-such-task\"");
  });
});

describe("reins_task_complete", () => {
  test("requires a non-empty completion summary", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    const before = h.readPlanFile("100-inspect-current-system.md");

    for (const completionSummary of [undefined, "", "   "]) {
      const outcome = await h.dispatchTool("reins_task_complete", {
        taskId: "inspect-current-system",
        completionSummary,
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.message).toContain("completionSummary");
    }

    // The refusal changed nothing durable.
    expect(h.readPlanFile("100-inspect-current-system.md")).toBe(before);
  });

  test("records the completion summary and marks the task done with a one-line result", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });

    const outcome = await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Mapped the loading path; all call sites listed in the summary.",
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("inspect-current-system");
    expect(outcome.message.split("\n")).toHaveLength(1);

    const task = frontmatterOf(h.readPlanFile("100-inspect-current-system.md"));
    expect(task.executionStatus).toBe("done");
    expect(task.completionSummary).toBe("Mapped the loading path; all call sites listed in the summary.");
  });

  test("refuses to complete a task that is not in_progress", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Never started this task.",
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("pending");
    expect(outcome.message).toContain("reins_task_start");
    expect(frontmatterOf(h.readPlanFile("100-inspect-current-system.md")).executionStatus).toBe("pending");
  });
});

describe("reins_task_block", () => {
  test("requires a non-empty reason", async () => {
    const h = await executingHarness();
    const before = h.readPlanFile("100-inspect-current-system.md");

    for (const reason of [undefined, "", "  "]) {
      const outcome = await h.dispatchTool("reins_task_block", {
        taskId: "inspect-current-system",
        reason,
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.message).toContain("reason");
    }

    // The refusal changed nothing durable.
    expect(h.readPlanFile("100-inspect-current-system.md")).toBe(before);
  });

  test("marks the task blocked with its reason, durably, with a one-line result", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_task_block", {
      taskId: "inspect-current-system",
      reason: "Waiting for a user decision on backwards compatibility.",
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("inspect-current-system");
    expect(outcome.message.split("\n")).toHaveLength(1);

    const task = frontmatterOf(h.readPlanFile("100-inspect-current-system.md"));
    expect(task.executionStatus).toBe("blocked");
    expect(task.blockedReason).toBe("Waiting for a user decision on backwards compatibility.");
  });

  test("starting a blocked task resumes it and clears the blocked reason", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_block", {
      taskId: "inspect-current-system",
      reason: "Waiting for a user decision on backwards compatibility.",
    });

    const outcome = await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("inspect-current-system");
    const resumed = frontmatterOf(h.readPlanFile("100-inspect-current-system.md"));
    expect(resumed.executionStatus).toBe("in_progress");
    // Resume: the stale blocked reason no longer applies and is gone.
    expect(resumed.blockedReason).toBeUndefined();
  });
});

describe("reins_progress", () => {
  test("appends to the active task's progressLog and the widget Now line shows the latest", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });

    const first = await h.dispatchTool("reins_progress", { note: "Mapped the config entry points" });
    expect(first.isError).toBe(false);
    expect(first.message.split("\n")).toHaveLength(1);

    const task = frontmatterOf(h.readPlanFile("100-inspect-current-system.md"));
    expect(task.progressLog).toEqual([
      { at: "2026-10-01T12:00:00.000Z", note: "Mapped the config entry points" },
    ]);

    // Append-only: the second entry joins the first, nothing is rewritten.
    await h.dispatchTool("reins_progress", { note: "Traced the consumers" });
    expect(frontmatterOf(h.readPlanFile("100-inspect-current-system.md")).progressLog).toEqual([
      { at: "2026-10-01T12:00:00.000Z", note: "Mapped the config entry points" },
      { at: "2026-10-01T12:00:00.000Z", note: "Traced the consumers" },
    ]);

    // The widget's Now line shows the latest entry.
    const rendered = ((h.ui.widgets[h.ui.widgets.length - 1].lines ?? [])).join("\n");
    expect(rendered).toContain("Now: Traced the consumers");
  });

  test("requires taskId while several tasks are in_progress, and refuses with none active", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });

    const ambiguous = await h.dispatchTool("reins_progress", { note: "Unclear whose progress" });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.message).toContain("taskId is required");
    expect(ambiguous.message).toContain("inspect-current-system");
    expect(ambiguous.message).toContain("implement-change");

    // Naming one of them records the note on that task only.
    const named = await h.dispatchTool("reins_progress", {
      note: "Provider model sketched",
      taskId: "implement-change",
    });
    expect(named.isError).toBe(false);
    expect(frontmatterOf(h.readPlanFile("200-implement-change.md")).progressLog).toEqual([
      { at: "2026-10-01T12:00:00.000Z", note: "Provider model sketched" },
    ]);
    expect(frontmatterOf(h.readPlanFile("100-inspect-current-system.md")).progressLog).toBeUndefined();

    // With nothing active, progress recording is refused.
    await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Done.",
    });
    await h.dispatchTool("reins_task_complete", {
      taskId: "implement-change",
      completionSummary: "Done.",
    });
    const none = await h.dispatchTool("reins_progress", { note: "No active work" });
    expect(none.isError).toBe(true);
    expect(none.message).toContain("no task is in_progress");
  });
});

describe("the widget across transitions", () => {
  test("reflects active work and counts after each transition, with two tasks in_progress at once", async () => {
    const h = await executingHarness();
    const rendersAfter = h.ui.widgets.length;

    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    const afterStart = h.ui.widgets[h.ui.widgets.length - 1];
    expect(h.ui.widgets.length).toBe(rendersAfter + 1);
    expect(afterStart.key).toBe("pi-reins");
    expect((afterStart.lines ?? []).join("\n")).toContain("Active: inspect-current-system");

    // A second task can go in_progress while the first stays active.
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });
    const both = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(both).toContain("inspect-current-system");
    expect(both).toContain("implement-change");
    expect(both).toContain("0/3 done");
    expect(frontmatterOf(h.readPlanFile("100-inspect-current-system.md")).executionStatus).toBe("in_progress");
    expect(frontmatterOf(h.readPlanFile("200-implement-change.md")).executionStatus).toBe("in_progress");

    await h.dispatchTool("reins_task_block", {
      taskId: "inspect-current-system",
      reason: "Waiting for a user decision",
    });
    const afterBlock = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(afterBlock).not.toContain("Active: inspect-current-system");
    expect(afterBlock).toContain("Blocked: inspect-current-system (Waiting for a user decision)");
    expect(afterBlock).toContain("Active: implement-change");

    await h.dispatchTool("reins_task_complete", {
      taskId: "implement-change",
      completionSummary: "Provider-based loader in place.",
    });
    const afterComplete = (h.ui.widgets[h.ui.widgets.length - 1].lines ?? []).join("\n");
    expect(afterComplete).toContain("1/3 done");
    expect(afterComplete).not.toContain("Active: implement-change");
  });
});

describe("reins_status", () => {
  test("reports a compact one-line view: gate, counts, active work, Now line, blocked", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_progress", { note: "Mapped the config entry points" });
    await h.dispatchTool("reins_task_block", {
      taskId: "verify-result",
      reason: "Waiting for a user decision on scope.",
    });

    const outcome = await h.dispatchTool("reins_status");

    expect(outcome.isError).toBe(false);
    expect(outcome.message.split("\n")).toHaveLength(1);
    expect(outcome.message).toContain("executing");
    expect(outcome.message).toContain("0/3");
    expect(outcome.message).toContain("inspect-current-system");
    expect(outcome.message).toContain("Now: Mapped the config entry points");
    expect(outcome.message).toContain("verify-result");
    expect(outcome.message).toContain("Waiting for a user decision on scope.");
  });

  test("is refused without an active contract", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });

    const detached = await h.dispatchTool("reins_status");
    expect(detached.isError).toBe(true);
    expect(detached.message).toContain("no contract is attached");

    await h.runCommand("reins-attach", "plan");
    // The plan-active fixture attaches as executing; drive the attached
    // (proposed) refusal from a proposed plan instead.
    const proposed = makeHarness({ planDir: "plan-valid", now: FIXED_NOW });
    await proposed.runCommand("reins-attach", "plan");
    const attached = await proposed.dispatchTool("reins_status");
    expect(attached.isError).toBe(true);
    expect(attached.message).toContain("not active");
  });
});

describe("tool_call guard: raw writes into the plan directory", () => {
  test("blocks raw edit and write calls into the plan directory with a reason naming the plugin tools", async () => {
    const h = await executingHarness();

    const write = await h.fire("tool_call", {
      toolName: "write",
      input: { path: "plan/100-inspect-current-system.md", content: "tampered" },
    });
    expect(write).toHaveLength(1);
    const writeResult = write[0] as { block?: boolean; reason?: string };
    expect(writeResult.block).toBe(true);
    expect(writeResult.reason).toContain("reins_task_start");

    // Absolute paths into the plan directory are blocked as well.
    const edit = await h.fire("tool_call", {
      toolName: "edit",
      input: { path: `${h.planDir}/log.md`, oldText: "x", newText: "y" },
    });
    expect(edit).toHaveLength(1);
    const editResult = edit[0] as { block?: boolean; reason?: string };
    expect(editResult.block).toBe(true);
    expect(editResult.reason).toContain("reins_");

    // Nothing was written: the block happens pre-execution.
    expect(h.readPlanFile("100-inspect-current-system.md")).not.toContain("tampered");
  });

  test("passes reads, writes outside the plan directory, and the plugin's own tools", async () => {
    const h = await executingHarness();

    // Reads are never blocked.
    expect(
      await h.fire("tool_call", { toolName: "read", input: { path: "plan/plan.md" } }),
    ).toEqual([]);
    expect(
      await h.fire("tool_call", { toolName: "bash", input: { command: "cat plan/plan.md" } }),
    ).toEqual([]);

    // Writes outside the plan directory pass.
    expect(
      await h.fire("tool_call", { toolName: "write", input: { path: "src/other.py", content: "x" } }),
    ).toEqual([]);
    expect(
      await h.fire("tool_call", { toolName: "bash", input: { command: "echo hi > /tmp/notes.txt" } }),
    ).toEqual([]);

    // The plugin's own tools are custom tools and are never blocked.
    expect(
      await h.fire("tool_call", { toolName: "reins_task_start", input: { taskId: "x" } }),
    ).toEqual([]);
  });

  test("is inert without an attached contract", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });

    const results = await h.fire("tool_call", {
      toolName: "write",
      input: { path: "plan/100-inspect-current-system.md", content: "x" },
    });
    expect(results).toEqual([]);
  });
});
