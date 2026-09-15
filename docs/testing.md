# Testing

## Framework

- _Not chosen yet._ pi-reins will ship as a Pi extension package,
  so a TypeScript toolchain (Vitest for unit tests, `tsc --noEmit`
  for types) is the likely shape once implementation starts. Fill
  this in when the first code lands.
- Type checking / linting: _to be filled in._

## Run commands

| Command | Purpose |
|---|---|
| _`npm test`_ | Run the full test suite (placeholder; fill in when a test runner exists) |

## Mock conventions

- _To be filled in as patterns emerge._

## Skill prose testing

- **YAML gotcha:** an unquoted `: ` inside a frontmatter value (e.g. a
  title containing `type: bug`) makes the YAML invalid; the task tools
  then *silently skip* the file. Quote such values.
- **Frontmatter keys:** the task tools read `kind`, `slug`, `title`,
  `type`, `map`, `blocked_by`, `status`, `size`, `started_at`,
  `completed_at` (tasks); `kind`, `slug`, `title`, `task`, `mode`,
  `status`, `size`, `blocked_by` (legacy slices); `kind`, `slug`, `title`,
  `tasks`, `status`, `started_at`, `completed_at` (maps). Malformed
  frontmatter makes an artifact invisible to the graph tools.
