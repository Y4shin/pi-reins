/**
 * The session-scoped plan-directory watcher.
 *
 * Best-effort live notification while the session is idle: a native
 * fs.watch on the plan directory (recursive) drives a debounced drift
 * callback; when the watcher is unavailable or errors, a polling
 * fallback engages (the pi-subagents watch strategy is the prior art).
 * Every timer is unref'd so the watcher never holds the process open,
 * and `stop()` tears the watcher and both timers down (the
 * session_shutdown leg calls it).
 *
 * The watcher only reports that the directory changed; deciding whether
 * the change is contract-significant and out-of-band is the drift
 * monitor's job (a rescan and fingerprint comparison), so raw fs events
 * on execution-state files and proposals cost nothing but a debounced
 * no-op.
 */

import { existsSync, watch, type FSWatcher } from "node:fs";

/** Polling fallback cadence when the native watcher is unavailable. */
const POLL_INTERVAL_MS = 2_000;

/** Quiet window before a burst of fs events fires one drift check. */
const DEBOUNCE_MS = 250;

export interface PlanWatcherOptions {
  /** Absolute plan directory to watch. */
  planDir: string;
  /** Called (debounced) when the directory reports changes. */
  onDrift(): void;
  /** Called when the native watcher is unavailable and polling took over. */
  onFallback(reason: string): void;
  /** Test overrides for the cadences. */
  pollIntervalMs?: number;
  debounceMs?: number;
}

export interface PlanWatcher {
  /** Stop watching: closes the native watcher and clears every timer. */
  stop(): void;
}

/**
 * Watch a plan directory for changes with a polling fallback. Never
 * throws: a native watcher that cannot be created (for example the
 * directory does not exist yet) engages the polling fallback instead.
 */
export function createPlanWatcher(options: PlanWatcherOptions): PlanWatcher {
  const pollInterval = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const debounce = options.debounceMs ?? DEBOUNCE_MS;

  let stopped = false;
  let watcher: FSWatcher | undefined;
  let pollTimer: NodeJS.Timeout | undefined;
  let debounceTimer: NodeJS.Timeout | undefined;
  let fellBack = false;

  const fireDrift = (): void => {
    if (stopped) return;
    options.onDrift();
  };

  const scheduleDrift = (): void => {
    if (stopped) return;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      fireDrift();
    }, debounce);
    debounceTimer.unref?.();
  };

  const fallbackToPolling = (reason: string): void => {
    if (stopped || fellBack) return;
    fellBack = true;
    if (watcher !== undefined) {
      watcher.close();
      watcher = undefined;
    }
    options.onFallback(reason);
    pollTimer = setInterval(scheduleDrift, pollInterval);
    pollTimer.unref?.();
  };

  if (!existsSync(options.planDir)) {
    // A native recursive watcher on a missing directory neither throws
    // nor errors on every platform: it silently watches nothing. Route
    // the missing root straight to the polling fallback; the fallback
    // keeps watching and sees the directory appear.
    fallbackToPolling(`the plan directory does not exist yet: ${options.planDir}`);
  } else {
    try {
      watcher = watch(options.planDir, { recursive: true }, () => scheduleDrift());
      watcher.on("error", (err: Error) => fallbackToPolling(err.message));
    } catch (err) {
      fallbackToPolling((err as Error).message);
    }
  }

  return {
    stop(): void {
      stopped = true;
      if (watcher !== undefined) {
        watcher.close();
        watcher = undefined;
      }
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
    },
  };
}
