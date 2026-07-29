# Required project context

Before investigating, planning, editing, or reviewing this repository, read [`AGENTS.md`](../AGENTS.md), then [`docs/agent/00-brief.md`](../docs/agent/00-brief.md), and only the task-specific pack selected by `AGENTS.md`.

This is mandatory. Do not begin implementation before completing the context gate. Update the affected pack whenever a stable contract, architecture boundary, invariant, command, runbook, or known seam changes.

For an implementation change, run `npm run brain:impact` before editing. Run `npm run sync:brain` after adding or removing an API route, entity, migration, shared-type export, or UI feature.

Start every task with `npm run brain:task -- "<complete user request>"` and obey its `Workflow`. For `product-intelligence-required`, read every `Read now` vault note plus `docs/agent/07-product-intelligence.md` before proposing a solution; the local receipt is required for product-sensitive changes to pass `check:brain`.

Finish every implementation or review response with the one-line `Brain trace` format required by `AGENTS.md`. It is an audit receipt, not private reasoning.
