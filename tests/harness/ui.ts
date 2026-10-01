/**
 * Scripted UI stub for the harness.
 *
 * Dialogs answer from a script (gates run deterministically); widget
 * and notification calls are captured for assertion. An unscripted
 * answer fails closed: confirm false, select and input undefined.
 */

import type { ReinsUi } from "../../src/deps.js";

export interface UiScript {
  confirm?:
    | boolean
    | ((title: string, message: string) => boolean | Promise<boolean>);
  select?:
    | string
    | undefined
    | ((title: string, options: string[]) => string | undefined | Promise<string | undefined>);
  input?:
    | string
    | undefined
    | ((title: string, placeholder?: string) => string | undefined | Promise<string | undefined>);
}

export interface CapturedDialog {
  kind: "confirm" | "select" | "input";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
}

export interface CapturedUi {
  ui: ReinsUi;
  notifies: Array<{ message: string; type?: string }>;
  widgets: Array<{ key: string; lines: string[] | undefined }>;
  dialogs: CapturedDialog[];
}

export function createUiStub(script: UiScript = {}, hasUI = true): CapturedUi {
  const notifies: CapturedUi["notifies"] = [];
  const widgets: CapturedUi["widgets"] = [];
  const dialogs: CapturedDialog[] = [];

  const ui: ReinsUi = {
    hasUI,
    select: async (title, options) => {
      dialogs.push({ kind: "select", title, options });
      if (typeof script.select === "function") return script.select(title, options);
      return script.select;
    },
    confirm: async (title, message) => {
      dialogs.push({ kind: "confirm", title, message });
      if (typeof script.confirm === "function") return script.confirm(title, message);
      return script.confirm ?? false;
    },
    input: async (title, placeholder) => {
      dialogs.push({ kind: "input", title, placeholder });
      if (typeof script.input === "function") return script.input(title, placeholder);
      return script.input;
    },
    notify: (message, type) => {
      notifies.push({ message, type });
    },
    setWidget: (key, lines) => {
      widgets.push({ key, lines });
    },
  };

  return { ui, notifies, widgets, dialogs };
}
