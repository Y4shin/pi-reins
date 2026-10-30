/**
 * Out-of-band plan change detection and reconciliation.
 *
 * At every turn boundary (turn_start, turn_end) the contract
 * fingerprint is compared against the last armed baseline. A baseline
 * is armed whenever the contract enters executing, so everything the
 * plugin wrote on the way in (activation records, gate dispositions,
 * review acceptance) is absorbed by construction. Drift found at a
 * boundary is verified against the plugin's own observed writes
 * (`state.pluginContractWrites`, recorded by the plan-editing tools):
 * explained drift is absorbed silently, unexplained drift is
 * out-of-band.
 *
 * A session-scoped watcher (fs.watch with a polling fallback) provides
 * best-effort live notification while the session is idle; its callback
 * re-scans, requires two agreeing scans (a partially written file
 * settles), and applies the same verification.
 *
 * The reaction to out-of-band drift: notify the user, queue a forced
 * steering message for the model, and enter reconciling. While the gate
 * holds, task mutations are refused (the task tools gate on the phase)
 * and raw writes into the plan directory stay blocked (the tool_call
 * guard). The reconciliation dialog returns to executing on accept,
 * with the reconciled content as the new baseline; declining keeps the
 * gate held, and every following boundary re-offers it. Without an
 * interactive UI the gate holds fail-closed: it never auto-accepts.
 *
 * Everything here is ephemeral: the baseline and fingerprint live in
 * this closure and are never persisted. A session restart drops a held
 * gate (the durable plan directory is the authority; the user re-attaches).
 */

import type { ReinsDeps } from "../deps.js";
import { discoverPlanDir, type PlanScan } from "../plan/discover.js";
import { contractContentMap, fingerprintContract } from "../plan/fingerprint.js";
import { transition, type ReinsPhase, type ReinsState } from "../state.js";
import { renderWidget } from "../ui/widget.js";
import { requireUi } from "../ui/dialogs.js";
import { createPlanWatcher, type PlanWatcher } from "./watch.js";

/** The state and deps accessors the monitor shares with the wiring. */
export interface DriftMonitorIo {
  /** Live read of the ephemeral plugin state. */
  state(): ReinsState;
  /** Propagates gate transitions and drained observed writes. */
  setState(state: ReinsState): void;
  /** Fresh deps rooted at the attached plan directory. */
  deps(ctx: unknown): ReinsDeps;
  /** Test overrides for the watcher cadences. */
  pollIntervalMs?: number;
  debounceMs?: number;
}

export interface DriftMonitor {
  /**
   * The boundary leg (turn_start and turn_end, and the attach/activate
   * commands): arms the baseline when executing is entered, verifies
   * drift otherwise, and re-offers a held reconciliation.
   */
  sync(ctx?: unknown): Promise<void>;
  /** The watcher/polling callback: live drift check while the session runs. */
  onWatchedDrift(): Promise<void>;
  /** Tear the watcher down (the session_shutdown leg). */
  stop(): void;
}

/** One measured state of the plan directory: fingerprint plus canonical content. */
interface Measure {
  scan: PlanScan;
  hash: string;
  files: Map<string, string>;
}

function measure(deps: ReinsDeps, planDir: string): Measure {
  const scan = discoverPlanDir(deps.fs, planDir);
  return { scan, hash: fingerprintContract(deps.fs, scan), files: contractContentMap(deps.fs, scan) };
}

/** Files whose contract-significant content differs between two measurements. */
function changedFiles(base: Map<string, string>, current: Map<string, string>): string[] {
  const changed: string[] = [];
  for (const [file, content] of current) {
    if (base.get(file) !== content) changed.push(file);
  }
  for (const file of base.keys()) {
    if (!current.has(file)) changed.push(file);
  }
  return changed.sort();
}

export function createDriftMonitor(io: DriftMonitorIo): DriftMonitor {
  /** The phase at the previous boundary: entering executing re-arms. */
  let lastPhase: ReinsPhase | undefined;
  /** The armed baseline: fingerprint plus canonical content, all in memory. */
  let baseline: Measure | undefined;
  /** The live watcher, once a contract is executing. */
  let watcher: PlanWatcher | undefined;
  let watchedDir: string | undefined;
  /** The most recent context, for building deps from watcher callbacks. */
  let lastCtx: unknown;
  /** A reaction dialog is in flight: ignore further drift until it settles. */
  let reacting = false;

  const depsOf = (ctx: unknown): ReinsDeps => io.deps(ctx);

  /** Start (or restart) the session-scoped watcher for the plan directory. */
  function ensureWatcher(planDir: string, deps: ReinsDeps): void {
    if (watcher !== undefined && watchedDir === planDir) return;
    watcher?.stop();
    watchedDir = planDir;
    watcher = createPlanWatcher({
      planDir,
      pollIntervalMs: io.pollIntervalMs,
      debounceMs: io.debounceMs,
      onDrift: () => {
        void monitor.onWatchedDrift();
      },
      onFallback: (reason) => {
        deps.ui.notify(
          `reins: live plan-directory watching is unavailable (${reason}); ` +
            "the polling fallback is watching for changes instead.",
          "warning",
        );
      },
    });
  }

  /** Arm (or re-arm) the baseline: the current content is the agreed contract. */
  function arm(planDir: string, deps: ReinsDeps): void {
    baseline = measure(deps, planDir);
    ensureWatcher(planDir, deps);
  }

  /** Consume the observed plugin writes; returns the set of files they name. */
  function drainObservedWrites(state: ReinsState): Set<string> {
    const observed = state.pluginContractWrites;
    if (observed === undefined) return new Set();
    io.setState({ ...state, pluginContractWrites: undefined });
    return new Set(observed);
  }

  /**
   * Verify one measurement against the baseline: absorb drift the
   * plugin's observed writes explain, react to the rest.
   */
  async function verify(deps: ReinsDeps, state: ReinsState, current: Measure): Promise<void> {
    if (baseline === undefined) {
      baseline = current;
      return;
    }
    if (current.hash === baseline.hash) {
      drainObservedWrites(state);
      return;
    }
    const changed = changedFiles(baseline.files, current.files);
    const observed = drainObservedWrites(state);
    const unexplained = changed.filter((file) => !observed.has(file));
    if (unexplained.length === 0) {
      // Every changed file is the plugin's own doing: absorb silently.
      baseline = current;
      return;
    }
    await react(deps, state, unexplained, current);
  }

  /** The out-of-band reaction: notify, steer, hold, and ask for reconciliation. */
  async function react(deps: ReinsDeps, state: ReinsState, unexplained: string[], current: Measure): Promise<void> {
    reacting = true;
    try {
      const list = unexplained.join(", ");
      deps.ui.notify(
        `reins: out-of-band change to the execution contract detected (${list}). ` +
          "Task mutations are held until you reconcile the change.",
        "warning",
      );
      deps.steering.forceInject(
        "out-of-band",
        `Out-of-band plan change detected (${list}); mutations are held until the user ` +
          "reconciles. Do not write plan files; surface the change to the user.",
      );
      const gate = transition(state, "reconciling");
      io.setState(gate);
      renderWidget(deps, gate, current.scan);
      await settleReconciliation(deps, gate, current);
    } finally {
      reacting = false;
    }
  }

  /**
   * The reconciliation dialog: accept resumes executing on the changed
   * content (it becomes the new baseline); declining or dismissing
   * keeps the gate held. Without an interactive UI the gate holds
   * fail-closed (requireUi notifies; nothing is auto-accepted).
   */
  async function settleReconciliation(deps: ReinsDeps, state: ReinsState, current: Measure): Promise<void> {
    const planDir = state.planDir;
    if (planDir === undefined) return;
    const uiRefusal = requireUi(deps, "Reconciliation");
    if (uiRefusal !== null) return;
    const accepted = await deps.ui.confirm(
      "reins: out-of-band plan change",
      `Contract-significant files changed outside the plugin: ${changedFiles(baseline?.files ?? new Map(), current.files).join(", ")}. ` +
        "Accept the changed plan as the execution contract and resume executing? " +
        "Declining keeps task mutations held.",
    );
    if (accepted !== true) {
      deps.ui.notify(
        "reins: the contract stays held in reconciling until you reconcile the change; " +
          "the next turn boundary will ask again.",
        "warning",
      );
      return;
    }
    const resumed = transition(state, "executing");
    io.setState(resumed);
    baseline = current;
    deps.steering.forceInject(
      "gate-transition",
      "Out-of-band change reconciled; executing resumes on the current plan content.",
    );
    deps.ui.notify("reins: out-of-band change reconciled; executing resumes.", "info");
    renderWidget(deps, resumed, measure(deps, planDir).scan);
  }

  const monitor: DriftMonitor = {
    async sync(ctx) {
      if (reacting) return;
      const state = io.state();
      if (state.phase === "reconciling" && state.planDir !== undefined) {
        // A declined or dismissed reconciliation: re-offer it here.
        const deps = depsOf(ctx);
        await settleReconciliation(deps, state, measure(deps, state.planDir));
        return;
      }
      if (state.phase !== "executing" || state.planDir === undefined) {
        lastPhase = state.phase;
        return;
      }
      const deps = depsOf(ctx);
      lastCtx = ctx;
      if (lastPhase !== "executing") {
        // Entering executing: everything the plugin wrote on the way in
        // (activation, gate dispositions, review acceptance) is absorbed.
        lastPhase = "executing";
        arm(state.planDir, deps);
        return;
      }
      await verify(deps, state, measure(deps, state.planDir));
    },

    async onWatchedDrift() {
      if (reacting) return;
      const state = io.state();
      if (state.phase !== "executing" || state.planDir === undefined) return;
      const deps = depsOf(lastCtx);
      const first = measure(deps, state.planDir);
      if (baseline === undefined || first.hash === baseline.hash) return;
      // Stability check: a partially written file settles; only react
      // when two consecutive scans agree on the drift.
      const second = measure(deps, state.planDir);
      if (second.hash !== first.hash) return;
      await verify(deps, state, second);
    },

    stop() {
      watcher?.stop();
      watcher = undefined;
      watchedDir = undefined;
    },
  };

  return monitor;
}
