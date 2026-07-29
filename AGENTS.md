# Agent entry point

Before any investigation, plan, edit, or review: read [`docs/agent/00-brief.md`](docs/agent/00-brief.md), then read only the matching context:

| Task | Context |
| --- | --- |
| API, DTO, database, auth | [`01-backend-contracts.md`](docs/agent/01-backend-contracts.md) |
| Drops, balances, inventory, rarity, milestones | [`02-economy-invariants.md`](docs/agent/02-economy-invariants.md) |
| React routes, screens, mocks, UI tests | [`03-ui-and-tests.md`](docs/agent/03-ui-and-tests.md) |
| Stable Diffusion generation or ingest | [`04-card-forge.md`](docs/agent/04-card-forge.md) |
| Product system, economy, shop, auction, lore, story, progression | Run `npm run brain:retrieve -- "<request>"`; read every `Read now` vault note and use `17 - Product - Solution Brief Template` |
| Cross-cutting work or maintenance | [`05-change-playbook.md`](docs/agent/05-change-playbook.md) |

Trust order: code/tests → `packages/shared-types` → migrations → agent packs → vault history. Do not bulk-read the vault.

For implementation, run `npm run brain:impact` before editing. If routes, entities, migrations, shared exports, or UI features change, run `npm run sync:brain` before tests. For product/design work, retrieval is mandatory: facts/decisions constrain the solution; open items are assumptions; a proposal is never canon without the user's decision.

## Mandatory handoff trace

End every implementation or review with one line:

`Brain trace — context: <packs read>; impact: <packs flagged or n/a>; knowledge: <files updated, or none + reason>; verify: <command/result>.`

This is an audit receipt, not private reasoning.

Rules: change shared types before both consumers and their mocks/tests; pair every balance mutation with a ledger row in one transaction; add and register a migration for schema changes; keep packs factual and compact; run `npm run check:brain` after knowledge edits.
