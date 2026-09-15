# pi-reins

Execution alignment for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent): bind an externally produced plan into an enforceable execution contract, steer the agent within bounds, and route material changes through the user.

> The agent may autonomously execute and report progress against the agreed plan, but material changes to that plan require explicit user involvement.

## Why

Coding agents drift. They declare victory early, skip work silently, expand scope without asking, or quietly reinterpret what "done" means. Chasing that with ever-larger prompt instructions pollutes context and still fails, because there is no shared, inspectable notion of what was agreed and where execution stands.

pi-reins makes the agreement itself the artifact. A plan becomes a binding execution contract: the user sees at low friction what is executing, what is done, what remains, and what is blocked. The agent gets freedom in *how* it performs agreed work, none over *what* that work is. When execution reveals that the plan must change, a two-gate protocol keeps the user in control: the agent proposes a direction, the user approves the intent, the agent edits the plan, the user reviews the concrete result.

## What it does

- **Attaches to externally produced plans.** It never plans, never discovers requirements. If a plan is malformed or insufficient, it says so instead of improvising.
- **User-controlled activation.** A plan becomes binding only when the user activates it.
- **Durable execution state.** Start, complete, block (with reason), and resume tasks, synchronized to the plan directory on disk so state survives restarts.
- **Compact steering.** A small, repeated summary keeps the contract salient to the model and pushes back on premature completion, stale progress, skipped tasks, and silent scope expansion.
- **Two-gate replanning.** Material changes need a proposal the user approves (intent), then plan edits the user reviews (concrete changes).
- **Budgets, later.** Phased roadmap adds dependencies, completion semantics, change detection, semantic drift steering, interoperability, and time budgets with honest, explainable assessment.

## What it is not

Not a planning assistant, requirements-discovery framework, subagent runtime, auditor-agent framework, autonomous continuation engine, project management app, scheduler, or task-assignment system. Planning systems stay external and interchangeable.

## Ecosystem boundary

```text
external planner / Grill-me / human
              |
              | creates plan
              v
      execution contract
              |
              v
      pi-reins (this plugin)
```

Grill-me develops the shared understanding of a plan; pi-reins takes over when that plan is to be executed.

## Status

**Pre-implementation.** The repository currently holds the binding specs and the task-workflow scaffolding; no code ships yet.

- [docs/plans/plan.md](docs/plans/plan.md): the phased implementation plan (mission, principles, Phases 1 through 7)
- [docs/plans/plan-fs-contract.md](docs/plans/plan-fs-contract.md): the execution-plan directory contract (the durable format)
- [CONTEXT.md](CONTEXT.md): the domain glossary
- [docs/adr/](docs/adr/): architecture decision records

## Install

Not yet published. When released:

```bash
pi install github:Y4shin/pi-reins
```

## License

TBD.
