# Plans

The two documents in this directory are the initial plan artifacts: the
plan for this package as it currently stands, and the binding
specification of the durable plan directory format the plugin operates
on.

- [plan.md](plan.md), the phased implementation plan: mission, core
  principles, phases 1 through 7, deliberate grilling surfaces, and
  explicit non-goals.
- [plan-fs-contract.md](plan-fs-contract.md), the execution plan
  directory contract: the durable, human-readable, agent-friendly
  filesystem format for an execution contract (`plan.md`, `index.md`,
  `log.md`, tasks, phases, dependencies, budgets, and the
  durable/ephemeral state boundary), a self-contained OKF 0.2 bundle.

These documents are not historical records of planning; they are
living, binding specs. Until the package is complete, they must be
kept in sync with any decision that alters them, as recorded in
Wayfinder maps under `docs/tasks/maps/`, so that they remain a
somewhat reliable source of truth for the package's design.

Derived state is never persisted, neither here nor in a plan directory
the plugin manages; the two documents above remain the only
authoritative sources.
