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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { defaultConfig } from "./config.js";
import type {
  ReinsDeps,
  ReinsUi,
  VerifierRunner,
} from "./deps.js";
import { noopSteering } from "./deps.js";
import { onSessionStart, type SessionStartEvent } from "./handlers/session.js";
import { createNodeFsPort } from "./plan/fs.js";
import { freshState, type ReinsState } from "./state.js";

/** The custom message type used for the context-tail steering summary. */
export const STEERING_MESSAGE_TYPE = "reins-steering";

export interface ReinsWiring {
  /** Override the real adapter factory (the test harness injects stubs). */
  createDeps?: (ctx: ExtensionContext) => ReinsDeps;
}

export function registerReins(pi: ExtensionAPI, wiring: ReinsWiring = {}): void {
  const createDeps = wiring.createDeps ?? ((ctx: ExtensionContext) => createRealDeps(ctx, pi));
  let state: ReinsState = freshState();

  pi.on("session_start", async (event, ctx) => {
    state = onSessionStart(createDeps(ctx), event as SessionStartEvent);
  });
}

export default function createReinsExtension(pi: ExtensionAPI): void {
  registerReins(pi);
}

function createRealDeps(ctx: ExtensionContext, pi: ExtensionAPI): ReinsDeps {
  return {
    fs: createNodeFsPort(ctx.cwd),
    ui: adaptUi(ctx),
    now: () => new Date().toISOString(),
    actor: resolveActor(ctx.cwd),
    config: defaultConfig(),
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
    steering: noopSteering(),
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
