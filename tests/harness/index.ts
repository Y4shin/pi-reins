/**
 * The synthetic-event test harness: the shared test substrate for
 * every pi-reins ticket.
 *
 * `createHarness` wires the real registration shell (`registerReins`)
 * over a capturing fake `ExtensionAPI`, injects a full `ReinsDeps`
 * with scripted UI stubs, a temporary plan directory, and recorder
 * ports, and exposes:
 *
 *   fire(eventType, event)   - the event-handler boundary
 *   dispatchTool(name, args) - the tool boundary (thrown refusals
 *                              surface as isError outcomes, matching pi)
 *   runCommand(name, args)   - the command boundary
 *
 * No LLM and no network anywhere: handlers and tools are driven
 * directly with synthetic events.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { defaultConfig } from "../../src/config.js";
import type {
  MessengerPort,
  ReinsConfig,
  ReinsDeps,
  SessionPort,
  SteeringPort,
  ToolsetPort,
  VerifierRequest,
  VerifierResult,
  VerifierRunner,
} from "../../src/deps.js";
import { registerReins } from "../../src/pi.js";
import { createNodeFsPort } from "../../src/plan/fs.js";
import { copyFixtureContents } from "./fixtures.js";
import { createUiStub, type CapturedUi, type UiScript } from "./ui.js";

export { cleanupFixtures, copyFixture } from "./fixtures.js";
export type { CapturedDialog, UiScript } from "./ui.js";

type Handler = (event: unknown, ctx: unknown) => unknown;

export interface HarnessToolDefinition {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: unknown,
  ) => unknown;
  [key: string]: unknown;
}

export interface HarnessCommandDefinition {
  description?: string;
  handler: (args: string, ctx: unknown) => unknown;
}

export interface HarnessOptions {
  /** Fixture name under tests/fixtures (or an absolute path) copied into the plan directory. */
  planDir?: string;
  /** Subdirectory of the temp root holding the plan directory. Default "plan". */
  planDirName?: string;
  uiScript?: UiScript;
  config?: Partial<ReinsConfig>;
  /** Fixed clock; defaults to the real clock. */
  now?: () => string;
  /** Verifier stub override; defaults to a captured no-op stub. */
  verifier?: VerifierRunner;
}

export interface ToolOutcome {
  isError: boolean;
  /** Joined text content, or the thrown refusal message. */
  message: string;
  result?: unknown;
}

export interface HarnessExtensionApi {
  on(type: string, handler: Handler): void;
  registerTool(definition: HarnessToolDefinition): void;
  registerCommand(name: string, definition: HarnessCommandDefinition): void;
  registerFlag(name: string, definition: unknown): void;
  registeredEvents(): string[];
  registeredTools(): string[];
  registeredCommands(): string[];
}

export interface ReinsHarness {
  /** Temporary directory standing in for the user's project cwd. */
  root: string;
  /** Absolute path of the plan directory (the deps.fs root). */
  planDir: string;
  deps: ReinsDeps;
  config: ReinsConfig;
  ui: CapturedUi;
  session: { entries: Array<{ customType: string; data?: unknown }> };
  messenger: { userMessages: string[]; steered: Array<{ content: string; options?: unknown }> };
  toolset: { active: string[]; history: string[][] };
  steering: { forced: Array<{ reason: string; note?: string }> };
  verifier: { requests: VerifierRequest[] };
  api: HarnessExtensionApi;
  /** Register a test tool through the same boundary pi registration uses. */
  registerTool(definition: HarnessToolDefinition): void;
  /** Register a test event handler through the same boundary pi registration uses. */
  on(type: string, handler: Handler): void;
  registeredEvents(): string[];
  /** Fire a synthetic event at every handler registered for its type. */
  fire(eventType: string, event?: unknown): Promise<unknown[]>;
  /** Dispatch a tool call as the model would; thrown errors become isError outcomes. */
  dispatchTool(name: string, args?: Record<string, unknown>): Promise<ToolOutcome>;
  /** Run a registered extension command. */
  runCommand(name: string, args?: string): Promise<void>;
  planFiles(): string[];
  readPlanFile(relativePath: string): string;
  writePlanFile(relativePath: string, content: string): void;
  dispose(): void;
}

let dispatchCounter = 0;

export function createHarness(options: HarnessOptions = {}): ReinsHarness {
  const root = mkdtempSync(join(tmpdir(), "reins-harness-"));
  const planDirName = options.planDirName ?? "plan";
  const planDir = join(root, planDirName);
  mkdirSync(planDir, { recursive: true });
  if (options.planDir) copyFixtureContents(options.planDir, planDir);

  const ui = createUiStub(options.uiScript ?? {});
  const session = { entries: [] as Array<{ customType: string; data?: unknown }> };
  const messenger = { userMessages: [] as string[], steered: [] as Array<{ content: string; options?: unknown }> };
  const toolset = { active: [] as string[], history: [] as string[][] };
  const steering = { forced: [] as Array<{ reason: string; note?: string }> };
  const verifier = { requests: [] as VerifierRequest[] };

  const sessionPort: SessionPort = {
    appendEntry: (customType, data) => {
      session.entries.push({ customType, data });
    },
  };

  const messengerPort: MessengerPort = {
    sendUserMessage: (content) => {
      messenger.userMessages.push(content);
    },
    steer: (content, steerOptions) => {
      messenger.steered.push({ content, options: steerOptions });
    },
  };

  const toolsetPort: ToolsetPort = {
    getActiveTools: () => [...toolset.active],
    setActiveTools: (names) => {
      toolset.active = [...names];
      toolset.history.push([...names]);
    },
  };

  const steeringPort: SteeringPort = {
    forceInject: (reason, note) => {
      steering.forced.push({ reason, note });
    },
  };

  const verifierPort: VerifierRunner =
    options.verifier ??
    {
      run: async (request: VerifierRequest): Promise<VerifierResult> => {
        verifier.requests.push(request);
        return { fulfilled: true, gaps: [] };
      },
    };

  const config: ReinsConfig = { ...defaultConfig(), ...options.config };

  const deps: ReinsDeps = {
    fs: createNodeFsPort(planDir),
    ui: ui.ui,
    now: options.now ?? (() => new Date().toISOString()),
    actor: "harness-test-user",
    config,
    session: sessionPort,
    messenger: messengerPort,
    toolset: toolsetPort,
    steering: steeringPort,
    verifier: verifierPort,
  };

  const harnessCtx = { cwd: root, hasUI: true, mode: "tui" };

  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, HarnessToolDefinition>();
  const commands = new Map<string, HarnessCommandDefinition>();
  const flags = new Map<string, unknown>();

  const api: HarnessExtensionApi = {
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler);
      handlers.set(type, list);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerFlag(name, definition) {
      flags.set(name, definition);
    },
    registeredEvents: () => [...handlers.keys()],
    registeredTools: () => [...tools.keys()],
    registeredCommands: () => [...commands.keys()],
  };

  // Wire the real registration shell over the fake api with the
  // harness deps. This drives the same code path pi uses.
  registerReins(api as unknown as ExtensionAPI, { createDeps: () => deps });

  const fire = async (eventType: string, event: unknown = {}): Promise<unknown[]> => {
    const results: unknown[] = [];
    for (const handler of handlers.get(eventType) ?? []) {
      const result = await handler(event, harnessCtx);
      if (result !== undefined) results.push(result);
    }
    return results;
  };

  const textOf = (result: unknown): string => {
    const r = result as { content?: Array<{ type?: string; text?: string }> } | undefined;
    return (
      r?.content
        ?.filter((block) => (block.type ?? "text") === "text")
        .map((block) => block.text ?? "")
        .join("\n") ?? ""
    );
  };

  const dispatchTool = async (
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolOutcome> => {
    const tool = tools.get(name);
    if (!tool) return { isError: true, message: `unknown tool: ${name}` };
    dispatchCounter += 1;
    try {
      const result = await tool.execute(
        `harness-${dispatchCounter}`,
        args,
        undefined,
        undefined,
        harnessCtx,
      );
      return { isError: false, message: textOf(result), result };
    } catch (err) {
      return { isError: true, message: (err as Error).message };
    }
  };

  return {
    root,
    planDir,
    deps,
    config,
    ui,
    session,
    messenger,
    toolset,
    steering,
    verifier,
    api,
    registerTool: (definition) => api.registerTool(definition),
    on: (type, handler) => api.on(type, handler),
    registeredEvents: () => api.registeredEvents(),
    fire,
    dispatchTool,
    runCommand: async (name, args = "") => {
      const command = commands.get(name);
      if (!command) throw new Error(`unknown command: ${name}`);
      await command.handler(args, harnessCtx);
    },
    planFiles: () => deps.fs.list(),
    readPlanFile: (relativePath) => deps.fs.read(relativePath),
    writePlanFile: (relativePath, content) => deps.fs.write(relativePath, content),
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
