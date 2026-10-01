/**
 * Plugin configuration defaults.
 *
 * The cadence and pushback cap come from the steering-injection
 * prototype's measured defaults. Flag wiring (--reins-cadence) lands
 * with the steering-injection ticket; this module owns the values.
 */

import type { ReinsConfig } from "./deps.js";

export function defaultConfig(): ReinsConfig {
  return { cadence: 4, pushbackMax: 2 };
}
