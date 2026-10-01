/**
 * Steering summary injection: the context-tail injection point, its
 * cadence, and its forced triggers, driven through the event-handler
 * boundary of the shared harness.
 *
 * Assertions follow the seam rules: in/out of the context handler and
 * the summary's required content lines, never exact strings beyond
 * those lines.
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

describe("cadence", () => {
  test("the summary is injected on the first call and then every fourth call", async () => {
    const h = await executingHarness();

    const calls = [];
    for (let i = 0; i < 8; i++) calls.push(await callLlm(h));

    expect(calls.map((c) => c.injected)).toEqual([
      true, false, false, true, // first call of the run, then cadence 4
      false, false, false, true, // the rhythm continues
    ]);
    expect(calls[0].message?.content).toContain(
      "Goal: Migrate configuration loading to the new provider model",
    );
  });
});

describe("forced triggers", () => {
  test("the first call of a new run is forced mid-cadence", async () => {
    const h = await executingHarness();
    await callLlm(h); // call 1: first of the implicit run
    await callLlm(h); // call 2: skipped

    await h.fire("before_agent_start", { type: "before_agent_start", prompt: "next prompt" });
    const third = await callLlm(h); // call 3: forced by the run boundary
    expect(third.injected).toBe(true);

    // The forced injection does not shift the cadence rhythm.
    const fourth = await callLlm(h); // call 4: cadence
    expect(fourth.injected).toBe(true);
    const fifth = await callLlm(h);
    expect(fifth.injected).toBe(false);
  });

  test("a compaction forces the next injection and is one-shot", async () => {
    const h = await executingHarness();
    await callLlm(h);
    await callLlm(h); // skipped

    await h.fire("session_compact", { type: "session_compact", reason: "threshold" });
    const afterCompact = await callLlm(h); // call 3: forced by compaction
    expect(afterCompact.injected).toBe(true);

    const fourth = await callLlm(h); // call 4: cadence
    expect(fourth.injected).toBe(true);
    const fifth = await callLlm(h); // the compaction trigger was consumed
    expect(fifth.injected).toBe(false);
  });

  test("a forced trigger queued on the steering port overrides cadence", async () => {
    const h = await executingHarness();
    await callLlm(h);
    await callLlm(h); // skipped

    h.deps.steering.forceInject("gate-transition");
    const forced = await callLlm(h); // call 3: forced override
    expect(forced.injected).toBe(true);
  });

  test("a forced trigger's note is carried into the summary", async () => {
    const h = await executingHarness();

    h.deps.steering.forceInject(
      "expected-declaration",
      "wrote src/unrelated.ts; no path declared by the active task matches",
    );
    const forced = await callLlm(h);
    expect(forced.injected).toBe(true);
    expect(forced.message?.content).toContain(
      "Note: wrote src/unrelated.ts; no path declared by the active task matches",
    );
  });
});

describe("summary content", () => {
  test("reflects durable state with the invariant header and progress instruction", async () => {
    const h = await executingHarness();
    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Mapped the loading path; every consumer listed.",
    });
    await h.dispatchTool("reins_task_start", { taskId: "implement-change" });
    await h.dispatchTool("reins_progress", {
      note: "Replaced the static loader with the provider model.",
    });
    await h.dispatchTool("reins_task_block", {
      taskId: "verify-result",
      reason: "Awaiting the migrated build",
    });

    const call = await callLlm(h); // first call of the run
    expect(call.injected).toBe(true);
    const content = call.message?.content ?? "";

    // The invariant header.
    expect(content).toContain("Stay within the agreed execution contract");
    expect(content).toContain("material plan changes require the user");
    // Durable state, read fresh from the plan directory.
    expect(content).toContain("Goal: Migrate configuration loading to the new provider model");
    expect(content).toContain("1/3 done");
    expect(content).toContain("active: implement-change");
    expect(content).toContain("blocked: verify-result");
    expect(content).toContain("Gate: executing");
    expect(content).toContain("Now: Replaced the static loader with the provider model.");
    // The progress-recording instruction.
    expect(content).toContain("reins_progress");

    // The summary never persists into the session.
    expect(h.session.entries.map((e) => e.customType)).not.toContain("reins-steering");
  });

  test("each injection reads the plan directory fresh", async () => {
    const h = await executingHarness();
    const first = await callLlm(h);
    expect(first.message?.content).toContain("0/3 done");

    await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    await h.dispatchTool("reins_task_complete", {
      taskId: "inspect-current-system",
      completionSummary: "Mapped the loading path.",
    });

    const second = await callLlm(h); // call 2: skipped
    expect(second.injected).toBe(false);
    const third = await callLlm(h); // call 3: skipped
    expect(third.injected).toBe(false);
    const fourth = await callLlm(h); // call 4: cadence
    expect(fourth.injected).toBe(true);
    expect(fourth.message?.content).toContain("1/3 done");
    expect(fourth.message?.content).toContain("active: none");
  });
});

describe("cadence configuration and persistence", () => {
  test("the cadence is configurable", async () => {
    const h = await executingHarness({ cadence: 2 });

    const calls = [];
    for (let i = 0; i < 4; i++) calls.push(await callLlm(h));

    expect(calls.map((c) => c.injected)).toEqual([
      true, true, // first call of the run, then cadence 2
      false, true,
    ]);
  });

  test("repeated injections never accumulate in the session or the plan directory", async () => {
    const h = await executingHarness();
    const filesBefore = h.planFiles().join("\n");

    for (const expected of [true, false, false, true, false]) {
      const call = await callLlm(h);
      // Each injected call appends exactly one steering message to a
      // fresh outgoing list; nothing carries over between calls.
      expect(call.injected).toBe(expected);
    }

    // No steering entry ever reaches the private session, and the plan
    // directory is untouched by injection.
    expect(h.session.entries.map((e) => e.customType)).not.toContain("reins-steering");
    expect(h.planFiles().join("\n")).toBe(filesBefore);
  });
});

describe("without an active contract", () => {
  test("a detached session returns the outgoing message list untouched", async () => {
    const h = makeHarness({});

    const messages = [{ role: "user", content: "hello", timestamp: 1 }];
    const results = await h.fire("context", { type: "context", messages });

    expect(results).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: "user", content: "hello", timestamp: 1 });
    expect(h.session.entries).toEqual([]);
  });

  test("an attached but not activated contract is not steered", async () => {
    const h = makeHarness({ planDir: "plan-valid", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");

    const messages = [{ role: "user", content: "hello", timestamp: 1 }];
    const results = await h.fire("context", { type: "context", messages });

    expect(results).toEqual([]);
    expect(messages).toHaveLength(1);
  });
});
