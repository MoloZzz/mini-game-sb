# Agent entry point

Before every investigation, plan, edit, or review, run `npm run brain:task -- "<complete user request>"`. Its `Workflow` is binding: for `product-intelligence-required`, the command already creates the mandatory product bundle and local audit receipt. Then read [`docs/agent/00-brief.md`](docs/agent/00-brief.md) and only the matching context:

| Task | Context |
| --- | --- |
| API, DTO, database, auth | [`01-backend-contracts.md`](docs/agent/01-backend-contracts.md) |
| Drops, balances, inventory, rarity, milestones | [`02-economy-invariants.md`](docs/agent/02-economy-invariants.md) |
| React routes, screens, mocks, UI tests | [`03-ui-and-tests.md`](docs/agent/03-ui-and-tests.md) |
| Stable Diffusion generation or ingest | [`04-card-forge.md`](docs/agent/04-card-forge.md) |
| Product system, economy, shop, auction, lore, story, progression | Follow the `brain:task` bundle: read every `Read now` note and [`07-product-intelligence.md`](docs/agent/07-product-intelligence.md) |
| Cross-cutting work or maintenance | [`05-change-playbook.md`](docs/agent/05-change-playbook.md) |

Trust order: code/tests → `packages/shared-types` → migrations → agent packs → vault history. Do not bulk-read the vault.

For implementation, run `npm run brain:impact` before editing. If routes, entities, migrations, shared exports, or UI features change, run `npm run sync:brain` before tests. For product/design work, `brain:task` is mandatory: facts/decisions constrain the solution; evidence never becomes a decision; open items are assumptions; a proposal is never canon without the user's decision. `check:brain` rejects product-sensitive changes if the current local task receipt is missing, stale, or routed as non-product.

## Mandatory handoff trace

End every implementation or review with one line:

`Brain trace — route: <workflow>/<receipt prefix>; context: <packs read>; impact: <packs flagged or n/a>; knowledge: <files updated, or none + reason>; verify: <command/result>.`

This is an audit receipt, not private reasoning.

Rules: change shared types before both consumers and their mocks/tests; pair every balance mutation with a ledger row in one transaction; add and register a migration for schema changes; keep packs factual and compact; run `npm run check:brain` after knowledge edits.
