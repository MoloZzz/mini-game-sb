# Agent entry point

## Mandatory context gate

Before investigating, planning, editing, or reviewing this repository, every agent **must** read [`docs/agent/00-brief.md`](docs/agent/00-brief.md) and then **must** read only the pack that matches the task:

| Task | Read |
| --- | --- |
| API, DTO, database, auth | [`01-backend-contracts.md`](docs/agent/01-backend-contracts.md) |
| Drops, balances, inventory, rarity, milestones | [`02-economy-invariants.md`](docs/agent/02-economy-invariants.md) |
| React routes, screens, mocks, UI tests | [`03-ui-and-tests.md`](docs/agent/03-ui-and-tests.md) |
| Stable Diffusion generation or ingest | [`04-card-forge.md`](docs/agent/04-card-forge.md) |
| Cross-cutting work or maintenance | [`05-change-playbook.md`](docs/agent/05-change-playbook.md) |

Do not begin implementation until this gate is complete. Do not bulk-read `card-game-data/` or old plans unless the task needs their historical rationale. For current behaviour, trust this order: executable code and tests → `packages/shared-types` → migrations → agent packs → vault notes.

For every implementation change, run `npm run brain:impact` before editing. It names the context packs that the current working-tree change can affect. If you add or remove an API route, entity, migration, shared-type export, or UI feature, run `npm run sync:brain` before tests; `npm test` rejects an outdated generated surface.

Rules that prevent expensive mistakes:

- Treat `packages/shared-types` as the API contract: change it before both consumers and update API mocks/tests in the same change.
- Keep all balance mutations and their ledger rows in one transaction. Read the economy pack before touching either.
- New database schema requires a migration registered in `game-api/src/database/database.module.ts`; never enable TypeORM `synchronize`.
- Keep context packs factual and compact. Update only the affected pack when a user-visible contract, architecture boundary, invariant, command, or known seam changes. Run `npm run check:brain` after editing them.
