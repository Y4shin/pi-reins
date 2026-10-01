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
});
