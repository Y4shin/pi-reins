/**
 * pi-reins registration shell: the one module that touches the live pi
 * runtime. Thin wiring only: it builds real adapters over the
 * ExtensionContext and registers handlers; every handler and tool is
 * an importable function over injected dependencies (ReinsDeps), which
 * is what the test harness drives.
 *
 * Inert without an attached contract: nothing is notified, rendered,
 * injected, or written until a plan directory is attached and active.
 */

import { execFileSync } from "node:child_process";
import { userInfo as osUserInfo } from "node:os";
import { isAbsolute, resolve as resolvePath } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { attach } from "./handlers/attach.js";
import { activate } from "./handlers/activate.js";
import { createContextHandler } from "./handlers/context.js";
import { CADENCE_FLAG, CADENCE_FLAG_DEFAULT, resolveConfig } from "./config.js";
import type {
  ReinsDeps,
  ReinsUi,
  VerifierRunner,
} from "./deps.js";
import { onSessionStart, type SessionStartEvent } from "./handlers/session.js";
import { guardPlanDirWrites } from "./handlers/tool-call.js";
import { createNodeFsPort } from "./plan/fs.js";
import { freshState, type ReinsState } from "./state.js";
import { createSteeringEngine, STEERING_MESSAGE_TYPE } from "./steering/engine.js";
import { createTaskTools } from "./tools/task.js";
import { createProposeTool } from "./tools/propose.js";
import { createRenegotiateTool } from "./tools/renegotiate.js";

/** The custom message type used for the context-tail steering summary. */
export { STEERING_MESSAGE_TYPE } from "./steering/engine.js";

export interface ReinsDepsOptions {
  /** Filesystem root override; the attach command roots the port at the plan directory. */
  fsRoot?: string;
}

export interface ReinsWiring {
  /** Override the real adapter factory (the test harness injects stubs). */
  createDeps?: (ctx: ExtensionContext, options?: ReinsDepsOptions) => ReinsDeps;
}

export function registerReins(pi: ExtensionAPI, wiring: ReinsWiring = {}): void {
  const steeringEngine = createSteeringEngine();
  const createDeps = wiring.createDeps ?? ((ctx, options) =>
    createRealDeps(ctx, pi, options, steeringEngine.port));
  let state: ReinsState = freshState();

  // The steering cadence is user-tunable per session (default 4).
  pi.registerFlag(CADENCE_FLAG, {
    description: "Inject the steering summary every Nth LLM call",
    type: "string",
    default: CADENCE_FLAG_DEFAULT,
  });

  pi.on("session_start", async (event, ctx) => {
    state = onSessionStart(createDeps(ctx), event as SessionStartEvent);
  });

  pi.registerCommand("reins-attach", {
    description:
      "Attach an execution plan directory: validate it against the execution-plan contract and bind it on pass",
    handler: async (args, ctx) => {
      const planPath = resolvePlanPath(ctx.cwd, args);
      const commandDeps = createDeps(ctx, { fsRoot: planPath });
      const outcome = attach(commandDeps, state, planPath);
      state = outcome.state;
    },
  });

  pi.registerCommand("reins-activate", {
    description:
      "Activate the attached execution contract: preview it, confirm, and begin execution",
    handler: async (_args, ctx) => {
      const commandDeps = createDeps(ctx, { fsRoot: state.planDir });
      const outcome = await activate(commandDeps, state);
      state = outcome.state;
    },
  });

  // The task lifecycle tools are the only write path into task state;
  // they read the live state and execute against deps rooted at the
  // plan directory (the harness's createDeps override honors fsRoot).
  // setState lets a gate transition (renegotiation) propagate.
  for (const tool of createTaskTools({
    deps: (ctx) => createDeps(ctx as ExtensionContext, { fsRoot: state.planDir }),
    state: () => state,
    setState: (next) => {
      state = next;
    },
  })) {
    pi.registerTool(tool);
  }

  pi.registerTool(
    createProposeTool({
      deps: (ctx) => createDeps(ctx as ExtensionContext, { fsRoot: state.planDir }),
      state: () => state,
      setState: (next) => {
        state = next;
      },
    }),
  );

  // The agent's deliberate opening of the renegotiation gate.
  pi.registerTool(
    createRenegotiateTool({
      deps: (ctx) => createDeps(ctx as ExtensionContext, { fsRoot: state.planDir }),
      state: () => state,
      setState: (next) => {
        state = next;
      },
    }),
  );

  // Raw writes into the plan directory are blocked pre-execution for
  // every bound contract; the reins_* tools are the legal alternative
  // the block reason names.
  pi.on("tool_call", (event, ctx) => guardPlanDirWrites(event, ctx, { planDir: state.planDir }));

  // Steering: the context-tail summary is the plugin's single injection
  // point. The run boundary resets the per-run call counter, compaction
  // forces the next injection, and the engine consumes forced triggers
  // queued on the deps' steering port.
  pi.on("before_agent_start", () => steeringEngine.onRunStart());
  pi.on("session_compact", () => steeringEngine.onCompacted());
  pi.on(
    "context",
    createContextHandler(steeringEngine, {
      state: () => state,
      deps: (ctx) => createDeps(ctx as ExtensionContext, { fsRoot: state.planDir }),
    }),
  );
}

/** Resolve the /reins-attach argument against the session cwd. */
function resolvePlanPath(cwd: string, args: string | undefined): string | undefined {
  const trimmed = (args ?? "").trim();
  if (trimmed === "") return undefined;
  return isAbsolute(trimmed) ? trimmed : resolvePath(cwd, trimmed);
}

export default function createReinsExtension(pi: ExtensionAPI): void {
  registerReins(pi);
}

function createRealDeps(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  options: ReinsDepsOptions | undefined,
  steering: ReinsDeps["steering"],
): ReinsDeps {
  return {
    fs: createNodeFsPort(options?.fsRoot ?? ctx.cwd),
    ui: adaptUi(ctx),
    now: () => new Date().toISOString(),
    // The verified-event actor comes from the plan directory's own
    // repository when one exists (the fs-contract's rule); commands
    // root the port at the plan directory, so prefer that root here.
    actor: resolveActor(options?.fsRoot ?? ctx.cwd),
    config: resolveConfig((name) => pi.getFlag(name)),
    session: {
      appendEntry: (customType, data) => {
        pi.appendEntry(customType, data);
      },
    },
    messenger: {
      sendUserMessage: (content, options) => {
        pi.sendUserMessage(content, options);
      },
      steer: (content, options) => {
        pi.sendMessage(
          { customType: STEERING_MESSAGE_TYPE, content, display: false },
          { deliverAs: "steer", triggerTurn: options?.triggerTurn },
        );
      },
    },
    toolset: {
      getActiveTools: () => pi.getActiveTools(),
      setActiveTools: (names) => {
        pi.setActiveTools(names);
      },
    },
    steering,
    verifier: createUnavailableVerifier(),
  };
}

function adaptUi(ctx: ExtensionContext): ReinsUi {
  return {
    hasUI: ctx.hasUI,
    select: (title, options) => ctx.ui.select(title, options),
    confirm: (title, message) => ctx.ui.confirm(title, message),
    input: (title, placeholder) => ctx.ui.input(title, placeholder),
    notify: (message, type) => {
      ctx.ui.notify(message, type ?? "info");
    },
    setWidget: (key, lines) => {
      ctx.ui.setWidget(key, lines);
    },
  };
}

/**
 * The human actor id: git user.email of the working repository, else
 * the OS username. (The plan directory's own repository is the normal
 * case; a plan directory outside cwd is resolved the same way for now.)
 */
function resolveActor(cwd: string): string {
  try {
    const email = execFileSync("git", ["config", "--get", "user.email"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (email !== "") return email;
  } catch {
    // fall through to the OS username
  }
  try {
    return osUserInfo().username;
  } catch {
    return "unknown";
  }
}

/**
 * The completion verifier is registered at session_start through
 * pi-subagents (plan-completion ticket); until then it refuses visibly
 * rather than pretending to verify.
 */
function createUnavailableVerifier(): VerifierRunner {
  return {
    run: async () => {
      throw new Error(
        "reins-completion-verifier is not available: pi-subagents integration lands with plan completion",
      );
    },
  };
}
