/**
 * The plan-level completion guard and the settled backstop, driven
 * through the tool and event-handler boundaries of the shared harness.
 *
 * `reins_complete` refuses with the remaining-work list while any task
 * is pending, in_progress, or blocked: the plan directory is the
 * structural truth, no text heuristics. The agent_settled backstop
 * compares durable state against the settled run and seeds a corrective
 * run through a real user-role pushback message, capped by the pushback
 * chain (config.pushbackMax) and reset by a user-submitted prompt.
 */

import { afterEach, describe, expect, test } from "vitest";

import { createHarness, type HarnessOptions, type ReinsHarness } from "./harness/index.js";

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

/** The steering message shape the context handler appends. */
interface SteeringMessage {
  role: string;
  customType: string;
  display: boolean;
  content: string;
}

/** One LLM call: fire the context event with a fresh outgoing message list. */
async function callLlm(h: ReinsHarness): Promise<{ injected: boolean; message?: SteeringMessage }> {
  const messages: unknown[] = [{ role: "user", content: "Continue executing the plan.", timestamp: 1 }];
  const results = await h.fire("context", { type: "context", messages });
  if (results.length === 0) return { injected: false };
  const message = messages[messages.length - 1] as unknown as SteeringMessage;
  expect(message.role).toBe("custom");
  expect(message.customType).toBe("reins-steering");
  expect(message.display).toBe(false);
  return { injected: true, message };
}

/** A harness attached to the active fixture: the contract is executing. */
async function executingHarness(config?: HarnessOptions["config"]) {
  const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, config });
  await h.runCommand("reins-attach", "plan");
  return h;
}

describe("reins_complete", () => {
  test("refuses with the remaining-work list while tasks are pending", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    // The refusal names the remaining tasks with their statuses.
    expect(outcome.message).toContain("inspect-current-system (pending)");
    expect(outcome.message).toContain("implement-change (pending)");
    expect(outcome.message).toContain("verify-result (pending)");
  });

  test("refuses naming active and blocked work, and no longer names done work", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Mapped the loading path.",
    });
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });
    await h.dispatchTool("reins_task_block", {
      taskId: "verify-result",
      reason: "Awaiting the migrated build",
    });

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("implement-change (in_progress)");
    expect(outcome.message).toContain("verify-result (blocked: Awaiting the migrated build)");
    // Done work is not thrown back as remaining.
    expect(outcome.message).not.toContain("inspect-current-system");
  });

  test("refuses without an attached contract", async () => {
    const h = makeHarness({});

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("no contract is attached");
  });

  test("refuses while the contract is attached but not active", async () => {
    const h = makeHarness({ planDir: "plan-valid", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");

    const outcome = await h.dispatchTool("reins_complete");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("not active");
  });

  test("a completion attempt forces the next steering injection, and only that one", async () => {
    // Periodic injection off: only forced triggers inject, so the flag
    // is isolated from the cadence rhythm.
    const h = await executingHarness({ cadence: 0 });
    const first = await callLlm(h);
    expect(first.injected).toBe(true); // first call of the run
    const second = await callLlm(h);
    expect(second.injected).toBe(false);

    await h.dispatchTool("reins_complete"); // the attempt (refused with remaining work)

    const after = await callLlm(h);
    expect(after.injected).toBe(true); // forced by the completion attempt
    const consumed = await callLlm(h);
    expect(consumed.injected).toBe(false); // one-shot: consumed by that injection
  });
});

describe("agent_settled backstop", () => {
  test("a settled run with remaining work seeds a corrective run through the user-role message", async () => {
    const h = await executingHarness();

    await h.fire("agent_settled", { type: "agent_settled" });

    expect(h.messenger.userMessages).toHaveLength(1);
    const pushback = h.messenger.userMessages[0];
    expect(pushback).toContain("inspect-current-system (pending)");
    expect(pushback).toContain("implement-change (pending)");
    expect(pushback).toContain("verify-result (pending)");
    // The pushback channel is the user-role message, per the prototype
    // measurement; steering stays the context-tail summary's channel.
    expect(h.messenger.steered).toEqual([]);
  });

  test("the pushback chain is capped at pushbackMax (default 2)", async () => {
    const h = await executingHarness();

    // Settle, pushback run starts, settles again: each cycle seeds one
    // more pushback until the cap, then the chain stays silent.
    await h.fire("agent_settled");
    await h.fire("before_agent_start", { prompt: "pushback run" });
    await h.fire("agent_settled");
    await h.fire("before_agent_start", { prompt: "pushback run" });
    await h.fire("agent_settled");

    expect(h.messenger.userMessages).toHaveLength(2);
  });

  test("the cap follows config.pushbackMax", async () => {
    const h = await executingHarness({ pushbackMax: 1 });

    await h.fire("agent_settled");
    await h.fire("before_agent_start", { prompt: "pushback run" });
    await h.fire("agent_settled");

    expect(h.messenger.userMessages).toHaveLength(1);
  });

  test("a user-submitted prompt resets the chain; the pushback run's own start does not", async () => {
    const h = await executingHarness({ pushbackMax: 1 });

    await h.fire("agent_settled"); // push 1: the chain is at the cap
    await h.fire("before_agent_start", { prompt: "pushback run" }); // the pushback run's start: no reset
    await h.fire("agent_settled"); // capped
    expect(h.messenger.userMessages).toHaveLength(1);

    // A user-submitted prompt resets the chain; the next settle pushes again.
    await h.fire("before_agent_start", { prompt: "keep going after the interruption" });
    await h.fire("agent_settled");

    expect(h.messenger.userMessages).toHaveLength(2);
  });

  test("a settled run with clean state triggers nothing", async () => {
    const h = await executingHarness();
    // Defer the fixture proposal so completing the last task does not
    // open the exhaustion gate; the backstop itself keys on remaining
    // task state only.
    h.writePlanFile(
      "proposals/cp-add-cli-migration.md",
      h.readPlanFile("proposals/cp-add-cli-migration.md").replace("kind: add\n", "kind: add\ndeferred: true\n"),
    );
    for (const taskId of ["inspect-current-system", "implement-change", "verify-result"]) {
      await h.dispatchTool("reins_task_start", { taskId });
      await h.dispatchTool("reins_task_complete", { taskId, completionSummary: `Did ${taskId}.` });
    }

    await h.fire("agent_settled", { type: "agent_settled" });

    expect(h.messenger.userMessages).toEqual([]);
    expect(h.messenger.steered).toEqual([]);
  });

  test("a settled run without an active contract triggers nothing", async () => {
    const attached = makeHarness({ planDir: "plan-valid", now: FIXED_NOW });
    await attached.runCommand("reins-attach", "plan"); // attached, not activated

    await attached.fire("agent_settled", { type: "agent_settled" });
    expect(attached.messenger.userMessages).toEqual([]);

    const detached = makeHarness({});
    await detached.fire("agent_settled", { type: "agent_settled" });
    expect(detached.messenger.userMessages).toEqual([]);
  });
});
