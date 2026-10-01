/**
 * Dependency-injection ports for pi-reins.
 *
 * `ReinsDeps` is the composition root every event handler and tool
 * consumes: `src/pi.ts` wires real adapters over the live pi runtime,
 * the test harness wires scripted stubs. Nothing else in the package
 * touches `pi` or `ctx` directly.
 */

/** Human actor id used for `verified` events: "human:<id>". */
export type HumanActor = string;

/** A root-scoped filesystem port. All paths are relative to the root. */
export interface FsPort {
  /** Read a file; throws when it does not exist. */
  read(path: string): string;
  /** Whether a file or directory exists. */
  exists(path: string): boolean;
  /** Every file under the root (or a subpath), as sorted relative paths. */
  list(path?: string): string[];
  /** Write a file, creating parent directories as needed. */
  write(path: string, content: string): void;
}

/** Dialog and surface port over pi's extension UI. */
export interface ReinsUi {
  /** Whether an interactive UI exists (TUI or RPC). Gates degrade fail-closed without it. */
  hasUI: boolean;
  select(title: string, options: string[]): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setWidget(key: string, lines: string[] | undefined): void;
}

/** Outbound message port. Pushback uses sendUserMessage; steering uses steer. */
export interface MessengerPort {
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
  steer(content: string, options?: { triggerTurn?: boolean }): void;
}

/** Private session-entry recorder (entries never enter LLM context). */
export interface SessionPort {
  appendEntry(customType: string, data?: unknown): void;
}

/** Active-tool-set port used for the plan-editing tool swap. */
export interface ToolsetPort {
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
}

/**
 * Steering override entry point. The default is a no-op; the steering
 * engine (steering-injection ticket) replaces it: forced triggers queue
 * on the port and are consumed by the next eligible injection.
 */
export interface SteeringPort {
  forceInject(reason: string, note?: string): void;
  /** Drain pending forced triggers, oldest first (the context leg consumes them). */
  takeForced?(): ForcedTrigger[];
}

/** One queued forced injection: why it fired and any targeted note. */
export interface ForcedTrigger {
  reason: string;
  note?: string;
}

export function noopSteering(): SteeringPort {
  return { forceInject() {} };
}

/** Request sent to the completion verifier agent. */
export interface VerifierRequest {
  /** The completion contract: goal plus per-task binding sections and completion summaries. */
  contract: string;
  /** Digest of accepted revisions from the log. */
  changeDigest: string;
}

/** Verdict returned by the completion verifier agent. */
export interface VerifierResult {
  fulfilled: boolean;
  gaps: string[];
}

/** Runner for the fresh-context completion verifier (stubbed in tests). */
export interface VerifierRunner {
  run(request: VerifierRequest): Promise<VerifierResult>;
}

/** Plugin configuration. */
export interface ReinsConfig {
  /** Inject the steering summary every Nth LLM call. */
  cadence: number;
  /** Cap on the settled-run pushback chain. */
  pushbackMax: number;
}

/** The full injected dependency set. */
export interface ReinsDeps {
  /** Filesystem port rooted at the plan directory once attached. */
  fs: FsPort;
  ui: ReinsUi;
  /** ISO 8601 clock. */
  now: () => string;
  /** Human actor id: git user.email of the repository, else the OS username. */
  actor: HumanActor;
  config: ReinsConfig;
  session: SessionPort;
  messenger: MessengerPort;
  toolset: ToolsetPort;
  steering: SteeringPort;
  verifier: VerifierRunner;
}
