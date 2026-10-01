import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/config.js";
import { freshState, transition, type ReinsPhase } from "../src/state.js";

describe("ReinsState machine", () => {
  test("starts detached with no attached plan", () => {
    const state = freshState();
    expect(state.phase).toBe("detached");
    expect(state.planDir).toBeUndefined();
  });

  test("walks the legal lifecycle from the arch spec", () => {
    let state = freshState();
    state = transition(state, "attached");
    expect(state.phase).toBe("attached");
    state = transition(state, "executing");
    expect(state.phase).toBe("executing");

    state = transition(state, "renegotiating");
    state = transition(state, "plan-editing");
    state = transition(state, "reviewing");
    state = transition(state, "executing");
    expect(state.phase).toBe("executing");

    state = transition(state, "reconciling");
    state = transition(state, "executing");
    state = transition(state, "completed");
    expect(state.phase).toBe("completed");
  });

  test("allows every transition the arch spec names", () => {
    const from = (phase: ReinsPhase): ReinsPhase[] => {
      const targets: ReinsPhase[] = [];
      let probe = freshState();
      if (phase !== "detached") {
        // Drive the probe into the requested phase along a legal path.
        probe = transition(probe, "attached");
        if (phase !== "attached") {
          probe = transition(probe, "executing");
          const via: Record<string, ReinsPhase[]> = {
            renegotiating: ["renegotiating"],
            "plan-editing": ["renegotiating", "plan-editing"],
            reviewing: ["renegotiating", "plan-editing", "reviewing"],
            reconciling: ["reconciling"],
            completed: ["completed"],
          };
          for (const step of via[phase] ?? []) probe = transition(probe, step);
        }
      }
      for (const target of [
        "attached",
        "executing",
        "renegotiating",
        "plan-editing",
        "reviewing",
        "reconciling",
        "completed",
      ] as ReinsPhase[]) {
        try {
          transition(probe, target);
          targets.push(target);
        } catch {
          // not legal from here
        }
      }
      return targets;
    };

    expect(from("detached").sort()).toEqual(["attached", "executing"]);
    expect(from("attached")).toEqual(["executing"]);
    expect(from("executing").sort()).toEqual(["completed", "reconciling", "renegotiating"]);
    expect(from("renegotiating").sort()).toEqual(["executing", "plan-editing"]);
    expect(from("plan-editing").sort()).toEqual(["executing", "reviewing"]);
    expect(from("reviewing").sort()).toEqual(["executing", "plan-editing"]);
    expect(from("reconciling")).toEqual(["executing"]);
    expect(from("completed")).toEqual([]);
  });

  test("rejects illegal transitions instead of guessing", () => {
    const state = freshState();
    expect(() => transition(state, "completed")).toThrow();
    expect(() => transition(state, "reviewing")).toThrow();
    const executing = transition(transition(freshState(), "attached"), "executing");
    expect(() => transition(executing, "plan-editing")).toThrow();
  });

  test("keeps the attached plan directory across transitions", () => {
    const state = transition(
      { ...freshState(), planDir: "/tmp/sample-plan" },
      "attached",
    );
    expect(state.planDir).toBe("/tmp/sample-plan");
    expect(state.phase).toBe("attached");
  });
});

describe("ReinsConfig", () => {
  test("defaults to the prototype-derived cadence and pushback cap", () => {
    const config = defaultConfig();
    expect(config.cadence).toBe(4);
    expect(config.pushbackMax).toBe(2);
  });
});
