/**
 * Attach-time validation rule classes, one malformed fixture per
 * class (seam 3: the plan-directory module against real fixture
 * directories). Every violation is reported, not only the first.
 */

import { afterEach, describe, expect, test } from "vitest";

import { discoverPlanDir } from "../../src/plan/discover.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { validatePlan } from "../../src/plan/validate.js";
import { cleanupFixtures, copyFixture } from "../harness/fixtures.js";

function validateFixture(name: string) {
  const dir = copyFixture(name);
  return validatePlan(discoverPlanDir(createNodeFsPort(dir), dir));
}

afterEach(() => {
  cleanupFixtures();
});

describe("validatePlan rule classes", () => {
  test("the conforming sample plan produces no violations", () => {
    expect(validateFixture("plan-valid")).toEqual([]);
  });

  test("frontmatter class: upstream hard rules surface as violations", () => {
    const violations = validateFixture("malformed-unparseable-frontmatter");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "plan.md", rule: "unparseable-frontmatter" }),
    );
  });

  test("frontmatter class: the root index carries no frontmatter beyond okf_version", () => {
    const violations = validateFixture("malformed-index-frontmatter");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "index-frontmatter-keys" }),
    );
  });
});
