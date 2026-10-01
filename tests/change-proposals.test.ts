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
