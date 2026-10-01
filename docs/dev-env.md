# Development environment

_How to start the dev environment, and whether reproduction is expected
of the agent._

## Starting

- Plain Node (24.x) on PATH, nothing else. No devenv or nix shell is
  required.
- `npm install` once after cloning; `npm test` and `npm run typecheck`
  are the whole loop.
- The `pi` CLI (0.84.4 or compatible) should be on PATH for the
  inert-load check and manual smoke runs; the suite skips that check
  when the binary is absent.

## Loading the extension

The package is a pi package (`pi.extensions` points at `./src/pi.ts`).
For development, load it by path:

```bash
pi --no-extensions -e ./src/pi.ts
```

`--no-extensions` keeps your installed extensions out of the run. The
extension is inert until a plan directory is attached, so loading it
has no visible effect by design.

## Reproduction

- **Reported plugin bugs:** reproduce in print mode with the extension
  loaded by path against a plan directory fixture, for example:

  ```bash
  pi -p --no-extensions -e ./src/pi.ts "reproduce the reported behavior"
  ```

  Prefer reproducing through the test harness first
  (`tests/harness/index.ts`): the same handlers and tools run
  synthetically with no LLM and no network, which is faster and
  reproducible in CI.

- **Do not attempt AI reproduction of the interactive gates.** The
  activation, renegotiation, and review gates are user dialogs by
  design; they run deterministically in tests only through scripted
  dialog stubs, and live behavior for them requires a human at the
  keyboard. Everything else (state transitions, durable file effects,
  refusals) reproduces through the harness.
