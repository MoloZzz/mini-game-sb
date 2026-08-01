---
tags: [planning]
---

# Roadmap

Back to [[00 - Card Game MOC]]

## Ordering Principle

**Reach a working roulette as early as possible.** It is both the most interesting part
and the riskiest; that is where everything may turn out less appealing than imagined.
Therefore, the roulette with mock data goes into M1, before the real API.

The easy-to-fall-into antipattern is spending three evenings on docker-compose, migrations,
and Nest module structure without a single animation frame. Motivation dies right there.

## M0 — Skeleton · ~1 evening

- [ ] Monorepo: `game-ui/`, `game-api/`, `card-forge/`, `storage/`
- [ ] `docker-compose.yml` — Postgres 16 only
- [ ] `game-api`: `nest new`, connect TypeORM, `/health`
- [ ] `game-ui`: `npm create vite` React+TS, Framer Motion, empty screen
- [ ] `card-forge`: venv, `pip install torch diffusers transformers accelerate pillow`
- [ ] `.gitignore`: `storage/`, `.venv/`, `node_modules/`, `*.safetensors`
- [ ] `packages/shared-types` with `CardDto`, `Rarity`

**Done when:** three processes start and `/health` returns 200.

## M1 — First Cards + Roulette with Mocks · ~2 evenings

Two tracks in parallel.

**Track A — generation:**
- [ ] `forge.py`: load pipeline, auto-select device
- [ ] Generate 6 cards with one recipe → verify that it works
- [ ] `recipes.yaml` with 4 recipes → ~20 cards
- [ ] Manually select the 12 best and save them in `storage/cards/`
- [ ] Write `mock-cards.json` with these 12

**Track B — roulette:**
- [ ] `<Reel />` component according to [[08 - UI - Roulette Spec]]
- [ ] Reel of 60 tiles from mock cards
- [ ] Preload → animation → land on index 55
- [ ] “Spin” button with a random local winner

**Done when:** you press the button, it spins, stops on the right card,
and you enjoy watching it twenty times in a row.

If it does not feel good at this stage, stop and tune easing, timing,
and tile size. There is no point moving on until this moment “clicks.”

## M2 — Real Backend · ~2 evenings

- [ ] Migrations: `cards`, `players`, `cases`, `player_cards`, `case_openings`, `transactions`
- [ ] `POST /admin/cards/ingest` + `forge.py ingest`
- [ ] Seed: 3 cases with weights [[05 - Game Design - Rarity & Drop Rates]], 1 player
- [ ] `GET /cards`, `GET /cases`, `GET /me`
- [ ] Serve static assets from `storage/`
- [ ] **`POST /cases/:slug/open`** — RNG, transaction, reel construction
- [ ] Probability test with 200k rolls
- [ ] Atomicity test: two parallel opens with balance for one case

**Done when:** curl to `/cases/starter-chest/open` returns a valid reel,
and the balance is debited exactly once.

## M3 — Integration · ~1 evening

- [ ] Replace UI mocks with the real API
- [ ] Lobby screen with cases and odds
- [ ] Reveal screen with full art
- [ ] Header with balance and number-change animation
- [ ] Error handling: insufficient funds, empty pool

**Done when:** the full cycle click → roulette → card in the database works without mocks.
This is the first version worth showing.

## M4 — Inventory and Economy · ~1.5 evenings

- [ ] `GET /me/inventory` with grouping and `copies`
- [ ] Inventory screen: grid, filters, collection progress
- [ ] `POST /me/inventory/:id/sell` + “do not sell the last copy” rule
- [ ] Daily bonus
- [ ] Pity counter
- [ ] Ledger SQL invariant in tests

## M5 — Admin Review · ~1 evening

- [ ] `GET /admin/cards?status=draft` — contact-sheet grid
- [ ] Approve/reject, edit name, rarity, ATK/DEF, and flavor
- [ ] Show prompt and seed for recipe analysis

Do this BEFORE the full batch; otherwise reviewing 280 cards will happen through psql.

## M6 — Full Pool · ~1 evening

On the RTX 3050, generation stops being the bottleneck; selection becomes
the bottleneck ([[06 - Generation - SD Pipeline]]).

- [ ] Expand `recipes.yaml` to 34 recipes
- [ ] Batch of ~283 cards — **~45 min**, while you drink coffee
- [ ] Review → 110 approved — **this is the main hour of the evening**
- [ ] Verify that all 6 rarities have a non-empty pool
- [ ] Upscale later as a separate CPU pass, not here (Q5 in
      [[11 - Planning - Open Questions]])

## M7 — Polish · indefinitely

- [ ] Rarity FX: particles, flashes, shake
- [ ] Sound: ticks, reveal samples, mute
- [ ] `prefers-reduced-motion`
- [ ] “Recent drops” reel in the lobby
- [ ] Collection milestones
- [ ] Provably fair
- [ ] Replay drop from `case_openings.reel`

## Estimate

**~9–10 evenings to a fully playable version** (M0–M6).
**Minimum interesting version — M0+M1, ~3 evenings.**

The most underestimated parts, based on experience with projects like this:
1. **Card selection.** 283 items at 10 seconds each is ~50 minutes
   of continuous clicking. On an RTX 3050, generation itself takes 45 min, so
   **selection takes longer than generation.** Therefore M5 is mandatory and must come earlier.
2. **Prompt tuning.** The first results will not look as imagined.
   Budget a separate evening for this.
3. **Roulette easing.** The difference between “fine” and “want more” is
   several hours of tuning the curve and timing.

For the initial environment setup (torch from the CUDA index, checking
`torch.cuda.is_available()`, downloading the ~2 GB model), budget an extra
30–40 minutes in M0. On Windows, this is where things most often go wrong.

## Order If Time Is Short

M0 → M1 → stop and see whether it is fun. If so, M2, M3.
Everything after M3 is refinement, not necessity.
