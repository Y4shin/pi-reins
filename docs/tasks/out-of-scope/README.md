# docs/tasks/out-of-scope/

A rejected-requests knowledge base. Each file documents one request that
was consciously ruled out, with the reason.

`triage` checks this directory for prior rejection before grilling an
incoming request: if the same ask was already ruled out, triage closes
the new one as a duplicate rejection instead of re-debating it. This stops
the team from reconsidering the same "no" every time a similar request
resurfaces.

One file per rejected request. The filename should be descriptive (e.g.
`mainstream-issue-trackers-only.md`). Each file states the request and
the reason it was ruled out.

This is distinct from `docs/tasks/archive/` (completed work) and
`docs/bugs/` (active bug reports): this directory holds only *rejected*
requests, not built or in-flight work.
