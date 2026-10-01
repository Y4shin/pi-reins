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

  test("profile class: okf_version is pinned and the root log is mandatory", () => {
    const violations = validateFixture("malformed-okf-version");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "index.md", rule: "okf-version" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "log.md", rule: "missing-reserved-file" }),
    );
  });

  test("profile class: plan.md declares the plan type and its required metadata", () => {
    const violations = validateFixture("malformed-plan-metadata");
    expect(violations).toContainEqual(
      expect.objectContaining({ file: "plan.md", rule: "plan-type" }),
    );
    const missing = violations.filter((v) => v.rule === "missing-required-field");
    expect(missing.map((v) => v.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("schemaVersion"), expect.stringContaining("goal")]),
    );
  });
});
