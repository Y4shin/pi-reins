import { describe, expect, test } from "vitest";

import { createHarness } from "./harness/index.js";

describe("createHarness", () => {
  test("drives the extension's session_start handler and is inert without a contract", async () => {
    const h = createHarness({ planDir: "plan-valid" });
    const before = h.planFiles().join("\n");

    // The registration shell registered the session_start handler.
    expect(h.registeredEvents()).toContain("session_start");

    const results = await h.fire("session_start", { reason: "startup" });

    // Inert without an attached contract: no outputs, no durable effects.
    expect(results).toEqual([]);
    expect(h.ui.notifies).toEqual([]);
    expect(h.ui.widgets).toEqual([]);
    expect(h.session.entries).toEqual([]);
    expect(h.planFiles().join("\n")).toBe(before);
    h.dispose();
  });

  test("scripted dialogs answer deterministically and tool dispatch asserts durable effects", async () => {
    const h = createHarness({ uiScript: { confirm: true } });

    h.registerTool({
      name: "test_touch",
      async execute() {
        const ok = await h.deps.ui.confirm("Write marker?", "creates marker.md");
        if (!ok) throw new Error("declined");
        h.deps.fs.write("marker.md", "hello\n");
        return { content: [{ type: "text", text: "written" }], details: {} };
      },
    });

    const outcome = await h.dispatchTool("test_touch");

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("written");
    expect(h.ui.dialogs).toEqual([
      { kind: "confirm", title: "Write marker?", message: "creates marker.md" },
    ]);
    // Durable file effect, visible on disk inside the plan directory.
    expect(h.readPlanFile("marker.md")).toBe("hello\n");
    h.dispose();
  });

  test("unscripted dialogs fail closed and thrown refusals surface as error outcomes", async () => {
    const h = createHarness({});

    h.registerTool({
      name: "test_gate",
      async execute() {
        const ok = await h.deps.ui.confirm("Proceed?", "no script answers this");
        if (!ok) throw new Error("refused: no user approval");
        return { content: [{ type: "text", text: "proceeded" }], details: {} };
      },
    });

    const outcome = await h.dispatchTool("test_gate");

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toBe("refused: no user approval");
    h.dispose();
  });

  test("block decisions with reasons flow from synthetic tool_call events", async () => {
    const h = createHarness({});

    h.on("tool_call", async (event) => {
      const e = event as { toolName: string; input: { command?: string } };
      if (e.toolName === "bash" && /rm -rf/.test(e.input.command ?? "")) {
        return { block: true, reason: "blocked by test guard" };
      }
      return undefined;
    });

    const blocked = await h.fire("tool_call", {
      toolName: "bash",
      input: { command: "rm -rf /" },
    });
    expect(blocked).toEqual([{ block: true, reason: "blocked by test guard" }]);

    const passed = await h.fire("tool_call", {
      toolName: "bash",
      input: { command: "ls" },
    });
    expect(passed).toEqual([]);
    h.dispose();
  });

  test("captures session entries, messenger calls, toolset, and steering ports", async () => {
    const h = createHarness({ config: { cadence: 7 } });

    h.on("session_start", async () => {
      h.deps.session.appendEntry("reins-test", { phase: "hi" });
      h.deps.messenger.sendUserMessage("pushback text");
      h.deps.messenger.steer("steer text", { triggerTurn: true });
      h.deps.toolset.setActiveTools(["read"]);
      h.deps.steering.forceInject("test-reason", "a note");
    });
    await h.fire("session_start", { reason: "startup" });

    expect(h.session.entries).toEqual([{ customType: "reins-test", data: { phase: "hi" } }]);
    expect(h.messenger.userMessages).toEqual(["pushback text"]);
    expect(h.messenger.steered).toEqual([
      { content: "steer text", options: { triggerTurn: true } },
    ]);
    expect(h.toolset.active).toEqual(["read"]);
    expect(h.toolset.history).toEqual([["read"]]);
    expect(h.steering.forced).toEqual([{ reason: "test-reason", note: "a note" }]);
    expect(h.config.cadence).toBe(7);
    h.dispose();
  });
});
