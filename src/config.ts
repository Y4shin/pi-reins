/**
 * Plugin configuration defaults and flag wiring.
 *
 * The cadence and pushback cap come from the steering-injection
 * prototype's measured defaults. `--reins-cadence` (registered by the
 * shell, resolved here) overrides the cadence per session; this module
 * owns the values.
 */

import type { ReinsConfig } from "./deps.js";

export function defaultConfig(): ReinsConfig {
  return { cadence: 4, pushbackMax: 2 };
}

/** The CLI flag overriding the steering cadence. */
export const CADENCE_FLAG = "reins-cadence";

/** The flag's default, as declared to the CLI. */
export const CADENCE_FLAG_DEFAULT = "4";

/**
 * Default config with the `--reins-cadence` flag applied when present.
 * Anything but a non-negative integer leaves the default standing.
 */
export function resolveConfig(
  getFlag: (name: string) => boolean | string | undefined,
): ReinsConfig {
  const config = defaultConfig();
  const raw = getFlag(CADENCE_FLAG);
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (raw.trim() !== "" && Number.isInteger(parsed) && parsed >= 0) {
      config.cadence = parsed;
    }
  }
  return config;
}
