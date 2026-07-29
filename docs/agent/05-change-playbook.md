# Change playbook

## Minimal reading by change type

| Change | Read first | Usually change |
| --- | --- | --- |
| Copy, layout, isolated component | brief + UI pack | feature component and its test |
| New/changed endpoint or DTO | brief + backend pack | shared types, API, client, MSW, tests |
| Economy or drop rule | brief + economy pack + backend pack | shared constants, service, unit/e2e tests |
| Schema | brief + backend pack | entity, migration, module registration, tests |
| Art generation/ingest | brief + forge pack + backend pack | manifest schema, forge, admin ingest/tests |

## Required follow-through

1. Run `npm run brain:impact` before implementation. It maps files changed from `HEAD` to the packs that may need a semantic update; inspect each listed pack before deciding it is unaffected.
2. Locate the actual owner with the packs; do not duplicate a service or client call that already has one owner.
3. For cross-service data, change `packages/shared-types` first and inspect both consumers.
4. After adding or removing a route, entity, migration, shared-type export, or UI feature, run `npm run sync:brain`. The generated surface is versioned; `check:brain` fails if it no longer matches the source tree.
5. Run the smallest relevant checks, then a build/typecheck when the change crosses a boundary. Common commands:

   - `npm run check:brain`
   - `npm run brain:impact`
   - `npm run sync:brain`
   - `npm run test --workspace game-ui`
   - `npm run build --workspace game-ui`
   - `npm run test --workspace game-api`
   - `npm run build --workspace game-api`

6. Update this knowledge system only if a stable fact changes: architecture ownership, API route/DTO, invariant, command, runbook, or known seam. Keep it under the stated word limits; link to source instead of reproducing implementation detail. If an observation is unresolved, put it in `card-game-data/11 - Planning - Open Questions.md`; if it records an enduring trade-off, add an ADR to `card-game-data/10 - Planning - Decisions.md`.

## Maintenance model

`AGENTS.md` is deliberately short because Codex loads it automatically. `CLAUDE.md`, Cursor's always-applied rule, and GitHub Copilot instructions all route their agents through the same mandatory gate. The `docs/agent/` files are progressive context packs. `scripts/check-agent-context.mjs` validates their presence, word budgets, repository paths, instruction shims, and the generated source surface. It cannot infer the meaning of an arbitrary code change, so `brain:impact` makes the responsible agent explicitly inspect the relevant pack before deciding whether to revise it.

Historical design notes remain in `card-game-data/`; record a new long-lived architectural decision there as an ADR when alternatives and consequences matter. Do not turn temporary implementation notes into permanent agent context.
