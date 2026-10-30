/**
 * Plan-editing enforcement, the review gate, abandon, and crash
 * recovery (the second half of the renegotiation machine).
 *
 * Plan-editing: the active tool set has no edit and write, the
 * tool_call guard is inverted (writes outside the plan directory are
 * blocked; writes into it stay blocked in every state), and the
 * approved intents are materialized through the plugin tools. Review:
 * a blocking dialog presents the concrete revision as the difference
 * from the pre-session snapshot; acceptance bumps the revision and
 * writes the durable records, rejection returns to plan-editing, and
 * abandon restores the snapshot. Crash recovery: a restart reconciles
 * leftover gate records into executing without touching durable
 * content.
 *
 * Driven through the shared harness seams: the event-handler boundary
 * (tool_call blocks, session_start reconcile), the tool boundary
 * (materialize, edit, remove, finish, refusals, durable file effects),
 * and the UI port (scripted review dialogs).
 */

import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

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

/**
 * A harness in the plan-editing phase: attached to the active fixture,
 * one renegotiation sweep approving the fixture's addition proposal
 * (cp-add-cli-migration, draft task migrate-cli-flags).
 */
async function planEditingHarness(): Promise<ReinsHarness> {
  const h = makeHarness({
    planDir: "plan-active",
    now: FIXED_NOW,
    uiScript: { select: "Approve" },
  });
  await h.runCommand("reins-attach", "plan");
  h.toolset.active = ["read", "edit", "write", "bash", "reins_status"];
  await h.dispatchTool("reins_renegotiate");
  return h;
}

describe("plan-editing enforcement: schema and guard inversion", () => {
  test("edit and write are absent from the schema during plan-editing", async () => {
    const h = await planEditingHarness();

    expect(h.toolset.active).toEqual(["read", "bash", "reins_status"]);
    // The plan-editing tool set exists: materialization tools are
    // registered so the agent can work through them.
    expect(h.api.registeredTools()).toEqual(
      expect.arrayContaining([
        "reins_materialize_add",
        "reins_edit_task",
        "reins_remove_task",
        "reins_finish_revision",
      ]),
    );
  });

  test("during plan-editing, raw writes outside the plan directory are blocked", async () => {
    const h = await planEditingHarness();

    const shell = await h.fire("tool_call", {
      toolName: "bash",
      input: { command: "echo hi > /tmp/notes.txt" },
    });
    expect(shell).toHaveLength(1);
    expect((shell[0] as { block?: boolean }).block).toBe(true);
    expect((shell[0] as { reason?: string }).reason).toContain("plan editing");

    const write = await h.fire("tool_call", {
      toolName: "write",
      input: { path: "src/other.py", content: "x" },
    });
    expect(write).toHaveLength(1);
    expect((write[0] as { block?: boolean }).block).toBe(true);
    expect((write[0] as { reason?: string }).reason).toContain("plan editing");
  });

  test("during plan-editing, raw writes into the plan directory stay blocked", async () => {
    const h = await planEditingHarness();

    const results = await h.fire("tool_call", {
      toolName: "bash",
      input: { command: "echo x > plan/notes.md" },
    });
    expect(results).toHaveLength(1);
    expect((results[0] as { block?: boolean }).block).toBe(true);
    expect((results[0] as { reason?: string }).reason).toContain("reins_");
    // Nothing was written either way: the block happens pre-execution.
    expect(h.planFiles().some((file) => file === "notes.md")).toBe(false);
  });

  test("reads and the plugin's own tools are never blocked", async () => {
    const h = await planEditingHarness();

    expect(
      await h.fire("tool_call", { toolName: "read", input: { path: "plan/plan.md" } }),
    ).toEqual([]);
    expect(
      await h.fire("tool_call", {
        toolName: "reins_materialize_add",
        input: { proposalId: "cp-add-cli-migration" },
      }),
    ).toEqual([]);
  });

  test("in executing, writes outside the plan directory still pass", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");

    expect(
      await h.fire("tool_call", {
        toolName: "bash",
        input: { command: "echo hi > /tmp/notes.txt" },
      }),
    ).toEqual([]);
  });
});
