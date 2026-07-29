# Change playbook

## Minimal reading by change type

| Change | Read first | Usually change |
| --- | --- | --- |
| Copy, layout, isolated component | brief + UI pack | feature component and its test |
| New/changed endpoint or DTO | brief + backend pack | shared types, API, client, MSW, tests |
| Economy or drop rule | brief + economy pack + backend pack | shared constants, service, unit/e2e tests |
| Schema | brief + backend pack | entity, migration, module registration, tests |
| Art generation/ingest | brief + forge pack + backend pack | manifest schema, forge, admin ingest/tests |
| Product system, economy, store, auction, lore, story | `brain:product` bundle + `07-product-intelligence` | evidence-first product brief, experiment, then implementation if approved |

## Required follow-through

1. Run `npm run brain:task -- "<complete user request>"` first. Its route is binding; for `product-intelligence-required`, read the bundle plus `07-product-intelligence`. Product-sensitive changes need its receipt to pass `check:brain`.
2. Run `npm run brain:impact` before implementation. It maps files changed from `HEAD` to the packs that may need a semantic update; inspect each listed pack before deciding it is unaffected.
3. Locate the actual owner with the packs; do not duplicate a service or client call that already has one owner.
4. For cross-service data, change `packages/shared-types` first and inspect both consumers.
5. After adding or removing a route, entity, migration, shared-type export, or UI feature, run `npm run sync:brain`. The generated surface is versioned; `check:brain` fails if it no longer matches the source tree.
6. Run the smallest relevant checks, then a build/typecheck when the change crosses a boundary. Common commands:

   - `npm run check:brain`
   - `npm run brain:impact`
   - `npm run sync:brain`
   - `npm run test --workspace game-ui`
   - `npm run build --workspace game-ui`
   - `npm run test --workspace game-api`
   - `npm run build --workspace game-api`

7. Update knowledge only for a stable fact: ownership, API route/DTO, invariant, command, runbook, or seam. Link to source instead of repeating code. Put unresolved observations in `card-game-data/11 - Planning - Open Questions.md` and enduring trade-offs in `card-game-data/10 - Planning - Decisions.md`.
   For a product decision, update the product system landscape or narrative bible too, rather than leaving the decision only in a chat.
8. Finish with the one-line `Brain trace` receipt from `AGENTS.md`. This lets the user audit context use without asking the agent to expose private reasoning.

## Maintenance model

`AGENTS.md` stays short because Codex loads it automatically. Claude, Cursor, and Copilot use the same gate. `brain:task` routes a request and records a privacy-safe receipt (hash, route, signals, paths; never request text); `brain:usage` shows use. The packs are progressive context. `check-agent-context.mjs` validates them, their paths, shims, receipt gate, and generated surface. `brain:impact` still requires inspection of affected packs.

Historical design notes remain in `card-game-data/`; record a new long-lived architectural decision there as an ADR when alternatives and consequences matter. Do not turn temporary implementation notes into permanent agent context.
