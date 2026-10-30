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
 * (cp-add-cli-migration, draft task migrate-cli-flags), optionally
 * plus a modify or remove proposal written and approved for a target.
 * `reviewAnswer` scripts the review dialog of reins_finish_revision
 * (an omitted answer dismisses it, matching the fail-closed stub).
 */
async function planEditingHarness(
  extra: { modify?: boolean; remove?: boolean; deferModify?: boolean } = {},
  reviewAnswer?: string | ((title: string) => string | undefined),
): Promise<ReinsHarness> {
  const extras: string[] = [];
  if (extra.modify) {
    extras.push([
      "---",
      "type: Change Proposal",
      "id: cp-modify-verify",
      "kind: modify",
      "target: verify-result",
      "title: Retitle the verification",
      "---",
      "",
      "# Change Proposal: Retitle the verification",
      "",
      "## Rationale",
      "",
      "The verification task should cover the migrated loader by name.",
      "",
    ].join("\n"));
  }
  if (extra.remove) {
    extras.push([
      "---",
      "type: Change Proposal",
      "id: cp-remove-implement",
      "kind: remove",
      "target: implement-change",
      "title: Drop the implementation task",
      "---",
      "",
      "# Change Proposal: Drop the implementation task",
      "",
      "## Rationale",
      "",
      "The change is already implemented upstream; the task is dead work.",
      "",
    ].join("\n"));
  }
  const h = makeHarness({
    planDir: "plan-active",
    now: FIXED_NOW,
    uiScript: {
      select: (title: string) => {
        if (reviewAnswer !== undefined && /revision review/i.test(title)) {
          return typeof reviewAnswer === "function" ? reviewAnswer(title) : reviewAnswer;
        }
        if (title.includes("Retitle the verification")) return extra.deferModify ? "Defer" : "Approve";
        if (
          title.includes("Drop the implementation") || title.includes("cp-add-cli-migration")
        ) {
          return "Approve";
        }
        return "Defer";
      },
    },
  });
  await h.runCommand("reins-attach", "plan");
  for (const body of extras) {
    const id = body.match(/^id: (.+)$/m)?.[1];
    h.writePlanFile(`proposals/${id}.md`, body);
  }
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

describe("materialization: applying the approved intents", () => {
  test("reins_materialize_add creates the task document exactly per the approved draft", async () => {
    const h = await planEditingHarness();

    const outcome = await h.dispatchTool("reins_materialize_add", {
      proposalId: "cp-add-cli-migration",
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("migrate-cli-flags");
    // Next numeric prefix after the fixture's 100/200/300 task files.
    expect(h.readPlanFile("310-migrate-cli-flags.md")).toBe(
      [
        "---",
        "type: Task",
        "id: migrate-cli-flags",
        "title: Migrate the CLI flags",
        "executionStatus: pending",
        "generated:",
        "  by: pi-reins/0.1.0",
        "  at: 2026-10-01T12:00:00.000Z",
        "---",
        "# Task",
        "",
        "## Description",
        "",
        "Migrate the CLI flag parsing onto the provider model.",
        "",
        "## Acceptance Criteria",
        "",
        "- The focused CLI tests pass.",
        "",
        "## Constraints",
        "",
        "- Preserve existing flag names.",
      ].join("\n") + "\n",
    );
  });

  test("materialization is gated on the approved intents and refuses duplicates", async () => {
    const h = await planEditingHarness();

    // An unknown proposal is refused, and so is one that was never
    // approved in the session (the sweep approved the addition only).
    const unknown = await h.dispatchTool("reins_materialize_add", { proposalId: "cp-nope" });
    expect(unknown.isError).toBe(true);
    expect(unknown.message).toContain("cp-nope");

    const unapproved = await h.dispatchTool("reins_materialize_add", {
      proposalId: "cp-add-cli-migration",
    });
    expect(unapproved.isError).toBe(false);
    const duplicate = await h.dispatchTool("reins_materialize_add", {
      proposalId: "cp-add-cli-migration",
    });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.message).toContain("migrate-cli-flags");
    expect(duplicate.message).toContain("already");
  });

  test("reins_edit_task applies an approved modification to its target only", async () => {
    const h = await planEditingHarness({ modify: true });

    const outcome = await h.dispatchTool("reins_edit_task", {
      taskId: "verify-result",
      title: "Verify the migrated loader",
      acceptanceCriteria: "- The focused verification passes.\n- The full suite is green.",
    });

    expect(outcome.isError).toBe(false);
    const after = h.readPlanFile("300-verify-result.md");
    expect(after).toContain("title: Verify the migrated loader");
    expect(after).toContain("- The focused verification passes.");
    expect(after).toContain("- The full suite is green.");
    // Untouched sections and frontmatter survive verbatim.
    expect(after).toContain("expectedBashRegexes:");
    expect(after).toContain("- No new dependencies.");
    expect(after).toContain("Confirm the migrated loader preserves existing behavior end to end.");
  });

  test("reins_edit_task refuses without an approved modification for the target", async () => {
    const h = await planEditingHarness();

    const none = await h.dispatchTool("reins_edit_task", {
      taskId: "verify-result",
      title: "Renamed without approval",
    });
    expect(none.isError).toBe(true);
    expect(none.message).toContain("approved");
    expect(h.readPlanFile("300-verify-result.md")).toContain("title: Verify the result");
  });

  test("reins_remove_task deletes the task document per the approved removal", async () => {
    const h = await planEditingHarness({ remove: true });

    const outcome = await h.dispatchTool("reins_remove_task", { taskId: "implement-change" });
    expect(outcome.isError).toBe(false);
    expect(h.planFiles().some((file) => file === "200-implement-change.md")).toBe(false);
  });

  test("reins_remove_task refuses without an approved removal", async () => {
    const h = await planEditingHarness();

    const outcome = await h.dispatchTool("reins_remove_task", { taskId: "implement-change" });
    expect(outcome.isError).toBe(true);
    expect(h.planFiles().some((file) => file === "200-implement-change.md")).toBe(true);
  });

  test("the materialization tools refuse outside plan-editing", async () => {
    const h = makeHarness({ planDir: "plan-active", now: FIXED_NOW });
    await h.runCommand("reins-attach", "plan");

    for (const [tool, args] of [
      ["reins_materialize_add", { proposalId: "cp-add-cli-migration" }],
      ["reins_edit_task", { taskId: "verify-result", title: "x" }],
      ["reins_remove_task", { taskId: "verify-result" }],
      ["reins_finish_revision", {}],
    ] as Array<[string, Record<string, unknown>]>) {
      const outcome = await h.dispatchTool(tool, args);
      expect(outcome.isError, tool).toBe(true);
      expect(outcome.message, tool).toContain("plan editing");
    }
  });
});

describe("the review gate: dialog, reject, abandon", () => {
  test("the review dialog presents the concrete revision as the diff from the pre-session snapshot", async () => {
    const h = await planEditingHarness({ modify: true, remove: true }, "Reject");
    await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });
    await h.dispatchTool("reins_edit_task", {
      taskId: "verify-result",
      acceptanceCriteria: "- The focused verification passes.",
    });
    await h.dispatchTool("reins_remove_task", { taskId: "implement-change" });

    const outcome = await h.dispatchTool("reins_finish_revision");
    expect(outcome.isError).toBe(false);

    // One blocking dialog: the concrete diff, with accept, reject, and
    // abandon as the answers.
    const dialog = h.ui.dialogs[h.ui.dialogs.length - 1];
    expect(dialog.kind).toBe("select");
    expect(dialog.options).toEqual(["Accept", "Reject", "Abandon"]);
    const title = dialog.title;
    expect(title).toContain("310-migrate-cli-flags");
    expect(title).toContain("Migrate the CLI flags");
    expect(title).toContain("200-implement-change.md");
    expect(title).toContain("verify-result");
    expect(title).toContain("Acceptance Criteria");
    expect(title).toContain("The focused verification passes.");
  });

  test("a dismissed review dialog holds reviewing fail-closed and can be re-offered", async () => {
    const h = await planEditingHarness();
    await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });

    const dismissed = await h.dispatchTool("reins_finish_revision");
    expect(dismissed.isError).toBe(false);
    // Nothing durable happened, and the review stays open.
    const refused = await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });
    expect(refused.isError).toBe(true);
    expect(refused.message).toContain("reviewing");

    // Re-offering works: the next finish presents the dialog again.
    let calls = 0;
    const h2 = await planEditingHarness({ modify: true }, () => {
      calls += 1;
      return calls === 1 ? undefined : "Reject";
    });
    await h2.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });
    const first = await h2.dispatchTool("reins_finish_revision");
    expect(first.isError).toBe(false);
    expect(h2.ui.dialogs[h2.ui.dialogs.length - 1].options).toEqual(["Accept", "Reject", "Abandon"]);
    const second = await h2.dispatchTool("reins_finish_revision");
    expect(second.isError).toBe(false);
    expect(second.message).toContain("plan editing");
  });

  test("rejection returns to plan-editing with the revision still in hand", async () => {
    const h = await planEditingHarness({ modify: true }, "Reject");
    await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });

    const outcome = await h.dispatchTool("reins_finish_revision");

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("plan editing");
    // The materialized content stays; editing continues from it.
    expect(h.planFiles().some((file) => file === "310-migrate-cli-flags.md")).toBe(true);
    const again = await h.dispatchTool("reins_edit_task", { taskId: "verify-result", title: "Retitled again" });
    expect(again.isError).toBe(false);
    expect(h.readPlanFile("300-verify-result.md")).toContain("title: Retitled again");
  });

  test("abandon restores the pre-session snapshot, keeps proposals, and returns to executing", async () => {
    const h = await planEditingHarness({ modify: true, remove: true }, "Abandon");
    await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });
    await h.dispatchTool("reins_edit_task", { taskId: "verify-result", title: "Retitled during revision" });
    await h.dispatchTool("reins_remove_task", { taskId: "implement-change" });

    const outcome = await h.dispatchTool("reins_finish_revision");

    expect(outcome.isError).toBe(false);
    // The contract content is the pre-session snapshot again.
    expect(h.planFiles().some((file) => file === "310-migrate-cli-flags.md")).toBe(false);
    expect(h.readPlanFile("300-verify-result.md")).toContain("title: Verify the result");
    expect(h.readPlanFile("300-verify-result.md")).toContain("- The full test suite passes.");
    expect(h.planFiles().some((file) => file === "200-implement-change.md")).toBe(true);
    // Pending proposals survive untouched, gate-1 dispositions included.
    expect(h.readPlanFile("proposals/cp-add-cli-migration.md")).toContain("kind: add");
    expect(h.readPlanFile("proposals/cp-modify-verify.md")).toContain("kind: modify");
    // The tool set is restored and executing resumes.
    expect(h.toolset.active).toContain("edit");
    expect(h.toolset.active).toContain("write");
    const start = await h.dispatchTool("reins_task_start", { taskId: "inspect-current-system" });
    expect(start.message).toBe("Started inspect-current-system.");
  });

  test("abandon does not relitigate gate-1 dispositions: deferred markers survive", async () => {
    const h = await planEditingHarness({ modify: true, deferModify: true }, "Abandon");
    await h.dispatchTool("reins_materialize_add", { proposalId: "cp-add-cli-migration" });

    const outcome = await h.dispatchTool("reins_finish_revision");
    expect(outcome.isError).toBe(false);

    expect(h.readPlanFile("proposals/cp-modify-verify.md")).toContain("deferred: true");
    expect(h.planFiles().some((file) => file === "310-migrate-cli-flags.md")).toBe(false);
  });
});
