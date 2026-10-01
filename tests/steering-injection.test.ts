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
