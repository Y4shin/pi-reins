/**
 * Expected-declaration steering nudges: the tool_call observation leg.
 *
 * A write outside every declared path regex, or a command matching none
 * of the declared command regexes, queues an immediate steering
 * injection with a targeted note naming the deviation, overriding the
 * cadence. Advisory only: nothing blocks, and tasks without the fields
 * trigger nothing. Driven through the event-handler boundary of the
 * shared harness; the steering recorder doubles as the forced-trigger
 * mailbox.
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
async function executingHarness(config?: HarnessOptions["config"]): Promise<ReinsHarness> {
  const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW, config });
  await h.runCommand("reins-attach", "plan");
  return h;
}

describe("out-of-declaration writes", () => {
  test("a write outside every declared path regex forces an injection with a targeted note, regardless of cadence", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });

    await callLlm(h); // call 1: first of the run
    await callLlm(h); // call 2: outside cadence, nothing queued

    const fired = await h.fire("tool_call", {
      type: "tool_call",
      toolName: "write",
      input: { path: "src/other/loader.ts", content: "x" },
    });
    // Advisory: the observation never blocks the call.
    expect(fired).toEqual([]);
    expect(h.steering.forced).toHaveLength(1);
    expect(h.steering.forced[0].reason).toBe("expected-declaration");
    expect(h.steering.forced[0].note).toContain("src/other/loader.ts");

    const nudged = await callLlm(h); // call 3: forced override, mid-cadence
    expect(nudged.injected).toBe(true);
    expect(nudged.message?.content).toContain("Note:");
    expect(nudged.message?.content).toContain("src/other/loader.ts");
  });

  test("an edit outside the declared paths nudges the same way", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });
    await callLlm(h);

    await h.fire("tool_call", {
      type: "tool_call",
      toolName: "edit",
      input: { path: "src/unrelated.ts", oldText: "a", newText: "b" },
    });
    expect(h.steering.forced).toHaveLength(1);
    expect(h.steering.forced[0].note).toContain("src/unrelated.ts");
  });
});

describe("out-of-declaration commands", () => {
  test("a command matching none of the declared command regexes forces an injection with a targeted note, regardless of cadence", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "verify-result" });

    await callLlm(h); // call 1: first of the run
    await callLlm(h); // call 2: outside cadence, nothing queued

    const fired = await h.fire("tool_call", {
      type: "tool_call",
      toolName: "bash",
      input: { command: "curl -s https://example.com" },
    });
    // Advisory: the observation never blocks the call.
    expect(fired).toEqual([]);
    expect(h.steering.forced).toHaveLength(1);
    expect(h.steering.forced[0].reason).toBe("expected-declaration");
    expect(h.steering.forced[0].note).toContain("curl -s https://example.com");

    const nudged = await callLlm(h); // call 3: forced override, mid-cadence
    expect(nudged.injected).toBe(true);
    expect(nudged.message?.content).toContain("Note:");
    expect(nudged.message?.content).toContain("curl -s https://example.com");
  });

  test("a cadence of 0 still injects the nudge", async () => {
    const h = await executingHarness({ cadence: 0 });
    await h.dispatchTool("reins_task_start", { taskId: "verify-result" });

    await callLlm(h); // call 1: first of the run is forced even at cadence 0
    const quiet = await callLlm(h); // call 2: periodic injection is disabled
    expect(quiet.injected).toBe(false);

    await h.fire("tool_call", {
      type: "tool_call",
      toolName: "bash",
      input: { command: "make all" },
    });
    const nudged = await callLlm(h); // call 3: the nudge forces it anyway
    expect(nudged.injected).toBe(true);
    expect(nudged.message?.content).toContain("Note:");
    expect(nudged.message?.content).toContain("make all");
  });
});
