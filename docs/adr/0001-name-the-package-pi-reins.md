# Name the package pi-reins

The plugin's central rule is that the agent executes and reports against
the agreed plan while material changes require explicit user
involvement: the user holds the reins, the agent has freedom of gait
but none over the route. The name needed to promise steering within
bounds and the user-controlled contract, and to not promise planning,
which the package explicitly does not do. `pi-reins` was chosen after
npm availability checks ruled out nothing else; the strongest
alternatives were pi-foreman (implies directing a crew of subagents,
which the plan disclaims), pi-execution-contract (literal but long),
and pi-plan-warden (fits Phase 4 enforcement but carries prison
connotations). The previous working title, pi-task-planner, promised
exactly the non-goal and was abandoned.

## Considered Options

- `pi-foreman`: strong fit, but implies subagent orchestration (an
  explicit non-goal)
- `pi-execution-contract`: self-describing but long and flat
- `pi-plan-warden`: good enforcement fit, prison connotations
- `pi-mandate`, `pi-steward`, `pi-accord`, `pi-covenant`, `pi-charter`:
  authorization/agreement registers, vaguer about the steering half
- `pi-conductor`: taken on npm

## Consequences

The npm name, the GitHub repo (`Y4shin/pi-reins`), and the README
description all carry the name; the local working directory still holds
the old `pi-task-planner` name until renamed.
