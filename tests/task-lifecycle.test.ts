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
});
