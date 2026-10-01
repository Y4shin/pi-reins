/**
 * Change proposals: the reins_propose_change tool, recording-time
 * refusals, attach-time proposal well-formedness, and the widget's
 * pending-proposal count, driven through the shared harness seams.
 *
 * Proposals are durable records under proposals/, never executed
 * before approval; recording never applies anything.
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

const ADD_PARAMS = {
  kind: "add",
  id: "cp-add-cli-flags",
  rationale: "The goal also covers the command line; no task addresses it.",
  proposedId: "migrate-cli-flags",
  proposedTitle: "Migrate the CLI flags",
  description: "Migrate the CLI flag parsing onto the provider model.",
  acceptanceCriteria: "- The focused CLI tests pass.",
  constraints: "- Preserve existing flag names.",
};

describe("reins_propose_change: malformed proposals are refused at recording time", () => {
  test("refuses an unknown kind, naming the vocabulary", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", {
      kind: "transform",
      rationale: "The plan needs a different shape.",
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("add, modify, remove");
    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });

  test("refuses an addition without its draft task content", async () => {
    const h = await executingHarness();
    const base = { kind: "add", id: "cp-incomplete", rationale: "Coverage is missing." };

    const noId = await h.dispatchTool("reins_propose_change", {
      ...base,
      proposedTitle: "X",
      description: "d",
      acceptanceCriteria: "a",
      constraints: "c",
    });
    expect(noId.isError).toBe(true);
    expect(noId.message).toContain("proposedId");

    const noCriteria = await h.dispatchTool("reins_propose_change", {
      ...base,
      proposedId: "some-task",
      proposedTitle: "X",
      description: "d",
      constraints: "c",
    });
    expect(noCriteria.isError).toBe(true);
    expect(noCriteria.message).toContain("acceptanceCriteria");

    const noConstraints = await h.dispatchTool("reins_propose_change", {
      ...base,
      proposedId: "some-task",
      proposedTitle: "X",
      description: "d",
      acceptanceCriteria: "a",
    });
    expect(noConstraints.isError).toBe(true);
    expect(noConstraints.message).toContain("constraints");

    // None of the refusals wrote anything durable.
    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });

  test("refuses a proposal without a rationale", async () => {
    const h = await executingHarness();

    for (const rationale of [undefined, "", "   "]) {
      const outcome = await h.dispatchTool("reins_propose_change", {
        kind: "add",
        id: "cp-no-rationale",
        rationale,
        proposedId: "t",
        proposedTitle: "T",
        description: "d",
        acceptanceCriteria: "a",
        constraints: "c",
      });
      expect(outcome.isError).toBe(true);
      expect(outcome.message).toContain("rationale");
    }
    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });

  test("refuses a proposal id that already exists or collides with a reserved filename", async () => {
    const h = await executingHarness();

    const duplicate = await h.dispatchTool("reins_propose_change", {
      ...ADD_PARAMS,
      id: "cp-add-cli-migration", // the fixture's own proposal
    });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.message).toContain("cp-add-cli-migration");

    const reserved = await h.dispatchTool("reins_propose_change", {
      ...ADD_PARAMS,
      id: "index",
    });
    expect(reserved.isError).toBe(true);
    expect(reserved.message).toContain("index");

    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });

  test("refuses dependency hints that are not lists of ids", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", {
      kind: "add",
      id: "cp-bad-deps",
      rationale: "Ordering matters here.",
      proposedId: "t",
      proposedTitle: "T",
      description: "d",
      acceptanceCriteria: "a",
      constraints: "c",
      dependsOn: "inspect-current-system",
    });

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("dependsOn");
    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });

  test("writes optional dependency hints and a generated id when kind add omits one", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", {
      kind: "add",
      rationale: "The goal also covers the CLI.",
      title: "Migrate the CLI flags",
      proposedId: "migrate-cli-flags",
      proposedTitle: "Migrate the CLI flags",
      description: "d",
      acceptanceCriteria: "a",
      constraints: "c",
      dependsOn: ["inspect-current-system"],
      enables: ["implement-change"],
    });

    expect(outcome.isError).toBe(false);
    const text = h.readPlanFile("proposals/cp-add-migrate-the-cli-flags.md");
    const frontmatter = frontmatterOf(text);
    expect(frontmatter.id).toBe("cp-add-migrate-the-cli-flags");
    expect(frontmatter.dependsOn).toEqual(["inspect-current-system"]);
    expect(frontmatter.enables).toEqual(["implement-change"]);
  });
});

describe("reins_propose_change: modify and remove require a resolvable target", () => {
  test("records a modification with the target task id", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", {
      kind: "modify",
      id: "cp-modify-inspect",
      target: "inspect-current-system",
      rationale: "The task's scope misses the CLI entry point consumers.",
      title: "Widen the inspection task",
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("cp-modify-inspect");
    expect(outcome.message.split("\n")).toHaveLength(1);

    const text = h.readPlanFile("proposals/cp-modify-inspect.md");
    const frontmatter = frontmatterOf(text);
    expect(frontmatter.type).toBe("Change Proposal");
    expect(frontmatter.kind).toBe("modify");
    expect(frontmatter.target).toBe("inspect-current-system");
    expect(text).toContain("## Rationale");
    // Modifications carry no draft task content.
    expect(text).not.toContain("## Proposed task (draft)");
  });

  test("records a removal with the target task id", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", {
      kind: "remove",
      target: "verify-result",
      rationale: "Existing behavior is covered by the implementation task's criteria.",
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.message.split("\n")).toHaveLength(1);
    const files = h.planFiles().filter((f) => f.startsWith("proposals/"));
    expect(files).toHaveLength(2); // the fixture's own proposal plus this one
    const text = h.readPlanFile(files[files.length - 1]);
    expect(frontmatterOf(text).kind).toBe("remove");
    expect(frontmatterOf(text).target).toBe("verify-result");
  });

  test("refuses modify and remove without a target or with an unresolvable one", async () => {
    const h = await executingHarness();

    const noTarget = await h.dispatchTool("reins_propose_change", {
      kind: "modify",
      rationale: "A modification without a target.",
    });
    expect(noTarget.isError).toBe(true);
    expect(noTarget.message).toContain("target");

    const unresolvable = await h.dispatchTool("reins_propose_change", {
      kind: "remove",
      target: "no-such-task",
      rationale: "A removal of work that does not exist.",
    });
    expect(unresolvable.isError).toBe(true);
    expect(unresolvable.message).toContain("no-such-task");

    // The refusals wrote nothing durable.
    expect(h.planFiles().filter((f) => f.startsWith("proposals/"))).toHaveLength(1);
  });
});

describe("reins_propose_change: recording an addition", () => {
  test("writes a proposal document with the draft binding sections", async () => {
    const h = await executingHarness();

    const outcome = await h.dispatchTool("reins_propose_change", ADD_PARAMS);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("cp-add-cli-flags");
    expect(outcome.message.split("\n")).toHaveLength(1);

    const text = h.readPlanFile("proposals/cp-add-cli-flags.md");
    const frontmatter = frontmatterOf(text);
    expect(frontmatter.type).toBe("Change Proposal");
    expect(frontmatter.id).toBe("cp-add-cli-flags");
    expect(frontmatter.kind).toBe("add");
    // Every plugin write stamps the OKF generated family.
    const generated = frontmatter.generated as { by: string; at: string };
    expect(generated.by).toMatch(/^pi-reins\//);
    expect(generated.at).toBe("2026-10-01T12:00:00.000Z");

    expect(text).toContain("# Change Proposal: Migrate the CLI flags");
    expect(text).toContain("## Rationale");
    expect(text).toContain("no task addresses it.");
    expect(text).toContain("## Proposed task (draft)");
    expect(text).toContain("id: migrate-cli-flags");
    expect(text).toContain("title: Migrate the CLI flags");
    expect(text).toContain("## Description");
    expect(text).toContain("Migrate the CLI flag parsing onto the provider model.");
    expect(text).toContain("## Acceptance Criteria");
    expect(text).toContain("- The focused CLI tests pass.");
    expect(text).toContain("## Constraints");
    expect(text).toContain("- Preserve existing flag names.");
  });
});
