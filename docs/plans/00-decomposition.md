# Decomposition — independent parts and their boundaries

Derived from `card-game-data/` (vault is the spec; this folder is the execution plan).
The vault is **read-only** for all implementation work: it records intent, not progress.

## Why this split

The vault describes one system, but it contains three genuinely independent
work streams. The dividing line is the one ADR-002 already established:
**different runtime, different speed, different lifecycle.**

| Part | Owns | Runtime | Depends on |
|---|---|---|---|
| **0 — Foundation** | root files, `packages/shared-types`, `storage/`, `docs/` | — | nothing |
| **A — game-api** | `game-api/` | Node/Nest, ms | Part 0 |
| **B — game-ui** | `game-ui/` | Browser/Vite, ms | Part 0 |
| **C — card-forge** | `card-forge/` | Python/CUDA, minutes | Part 0 |

## Dependency graph

```
        ┌──────────────────────────┐
        │ Part 0 — Foundation      │  DONE before anything else.
        │ shared-types = frozen    │  Serialization point.
        │ contract                 │
        └────────────┬─────────────┘
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
 ┌─────────┐   ┌──────────┐   ┌────────────┐
 │ A       │   │ B        │   │ C          │
 │game-api │   │ game-ui  │   │ card-forge │
 └────┬────┘   └────┬─────┘   └─────┬──────┘
      │             │               │
      │   MSW mocks │               │ writes PNG to storage/
      │   until A   │               │ POSTs /admin/cards/ingest
      └─────────────┴───────────────┘
              integration
```

**A, B and C never block each other during development.** That is deliberate,
and it is what makes parallel execution safe:

- **B does not wait for A.** `shared-types` fixes every DTO, so the UI develops
  against MSW handlers that return contract-shaped fixtures. Roadmap M1 already
  demands exactly this ("рулетка на мок-даних іде в M1, ще до реального API").
- **C does not wait for A.** The forge writes PNGs and a `manifest.json` to
  disk. `forge.py ingest` is a separate command run later, against whatever
  `/admin/cards/ingest` exists by then.
- **A does not wait for C.** Seeded placeholder cards let every endpoint and
  test run before a single diffusion step happens.

## File ownership — hard rule

Each part writes **only inside its own directory**. Nobody but Part 0 touches:

- `/package.json`, `/docker-compose.yml`, `/.gitignore`, `/.env.example`
- `/packages/shared-types/**`
- `/card-game-data/**` (the spec vault — read-only, always)
- `/docs/plans/**`

If a part believes `shared-types` needs a change, it **stops and reports**
rather than editing. A contract edited by one consumer is a contract that has
already drifted.

## The frozen contract

`packages/shared-types` is built and verified (`POOL_TARGET_TOTAL === 110`, all
three weight rows sum to 100, `WINNING_INDEX === 55`). It exports:

| Module | Contents |
|---|---|
| `rarity` | `Rarity`, `RARITY_META` (colour, sellValue, poolTarget, statRange), `PITY_THRESHOLD`, `isAtLeast` |
| `card` | `Element`, `Archetype`, `CardStatus`, `CardDto`, `GenMeta`, `AdminCardDto` |
| `case` | `RarityWeights`, `CaseDto`, `CASE_WEIGHTS`, `CASE_SEEDS`, `oneInN`, `weightsSumTo100` |
| `reel` | `TILE_W`, `PITCH`, `REEL_LENGTH`, `WINNING_INDEX`, `SPIN_DURATION_MS`, `SPIN_EASING`, `FILLER_DISTRIBUTION`, `ReelTileDto` |
| `player` | `Balance`, `PlayerDto`, `InventoryItemDto`, `INITIAL_GRANT`, `DAILY_BONUS` |
| `api` | every request/response shape + `ApiErrorCode` |

Both A and B import these. Neither redefines a rarity colour, a sell value, a
tile width or an error code locally — that duplication is precisely the drift
the vault warns about in `03 - Architecture - API Contracts.md`.

## Milestone mapping

The vault's M0–M7 are sequential *for one person working alone*. Split across
three parallel streams they regroup:

| Vault milestone | Part |
|---|---|
| M0 skeleton | 0 (done) + each part's own scaffold |
| M1 track A — first cards | C |
| M1 track B — reel on mocks | B |
| M2 — real backend | A |
| M3 — wiring | B (integration), A (CORS/static) |
| M4 — inventory & economy | A (endpoints) + B (screens) |
| M5 — admin review | A (endpoints) + B (grid) |
| M6 — full pool | C |
| M7 — polish | B |

## Verification each part owes

Not "it compiles" — the vault names specific invariants, and each is assigned:

- **A**: 200k-roll probability test within tolerance; weight rows sum to 100;
  pity fires on exactly the 30th dry open; ledger invariant
  `SUM(delta_coins) == balance_coins` returns empty; concurrent double-open
  debits exactly once.
- **B**: reel lands with the marker inside the winner tile for a swept range of
  container widths and jitter values; preload resolves on broken images;
  `prefers-reduced-motion` skips the spin.
- **C**: `torch.cuda.is_available()` is `True` on the RTX 3050; a 6-image smoke
  batch completes without OOM; `manifest.json` validates against
  `IngestCardInput`.

## Hardware facts that constrain Part C

Confirmed on this machine, not assumed:

- **RTX 3050 Laptop, 4096 MiB VRAM** — matches ADR-013 exactly.
- **Python 3.11 available as `py -3.11`.** The system default is 3.14, which
  has no torch/diffusers wheels. Part C must create its venv with 3.11.
- Peak VRAM at 512×512 fp16 batch=1 is ~3.1–3.9 GB. `torch_dtype=float16` and
  `safety_checker=None` are requirements, not optimizations.
