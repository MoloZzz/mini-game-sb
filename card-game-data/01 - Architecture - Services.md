---
tags: [architecture]
---

# Services

Back to [[00 - Card Game MOC]]

## Final Composition: 3 Services

```
┌──────────────┐   HTTP/JSON    ┌──────────────────┐
│   game-ui    │ ─────────────► │     game-api     │
│ React+Vite   │ ◄───────────── │  NestJS+TypeORM  │
│   :5173      │   <img src>    │      :3000       │
└──────────────┘ ─────────────► └────────┬─────────┘
                    static assets        │
                                         │ SQL
                                    ┌────▼─────┐
                                    │ Postgres │
                                    │  :5432   │
                                    └──────────┘
                                         ▲
                    POST /admin/cards/ingest
                                         │
                                ┌────────┴─────────┐
                                │   card-forge     │
                                │ Python+diffusers │
                                │      :8000       │
                                └────────┬─────────┘
                                         │ writes files
                                    ┌────▼─────────┐
                                    │ ./storage/   │
                                    │  cards/*.png │  ◄── shared volume,
                                    └──────────────┘      game-api serves as static assets
```

## Why Not 4 or 5

You suggested splitting image generation and storage into two services.
**Do not do this.** Image storage is not a service; it is a folder plus
`app.useStaticAssets('./storage')`. Making it a separate process adds:
an extra deployment, an extra network hop, an extra layer of errors — and zero benefit
at the scale of one laptop.

The rule for splitting is: **different runtime, different speed, different
lifecycle**. `card-forge` meets all three (Python instead of Node,
minutes instead of milliseconds, works offline, and can be turned off during gameplay).
So it is separate. A file folder meets none of them.

If S3 is ever needed, it will be a replacement for one adapter in `game-api`,
not a new service. The design already allows this.

## game-ui

**Stack:** React 18 + TypeScript + Vite + Framer Motion + Tailwind (optional)

**Owns:**
- All screens: case lobby, roulette, inventory, card details
- Roulette animation, rarity effects, sound
- Local UI state

**Does NOT own:**
- The decision about which card dropped (the server does this)
- The player balance as the source of truth (the server is authoritative; the UI only displays it)

**Key constraint:** before the animation starts, **all reel images must
be loaded**. Otherwise half the tiles will be empty while it spins.
Details → [[08 - UI - Roulette Spec]]

## game-api

**Stack:** NestJS + TypeORM + Postgres 16

**Owns:**
- Card catalog (`cards`)
- Player, balance, inventory (`players`, `player_cards`, `transactions`)
- Cases and their rarity weights (`cases`)
- **Drop RNG** — the single source of truth for what dropped
- Serving static assets from `./storage`
- Ingest endpoint for `card-forge`

**Nest modules:**

```
src/
  cards/       — catalog, CRUD, search, rarity filter
  cases/       — case config, weights
  drops/       — RNG, reel generation, opening transaction
  players/     — profile, balance
  inventory/   — player collection, duplicate sales
  ledger/      — transactions, credits/debits
  admin/       — ingest from card-forge, card review
  storage/     — static assets + file paths
```

**The most important transaction** is opening a case. It must be atomic:
debit currency → roll → create a drop record → add to inventory.
All or nothing. This is the main reason to use Postgres here instead of Mongo
(see [[10 - Planning - Decisions]], ADR-003).

## card-forge

**Stack:** Python 3.11 + `diffusers` + `torch` + FastAPI + Pillow

**Owns:**
- Loading and caching the SD 1.5 model
- Batch generation from a list of prompts
- Writing PNGs to `./storage/cards/` + preview thumbnails
- `manifest.json` with all generation parameters (seed, steps, cfg, prompt)
- Calling `POST /admin/cards/ingest` on game-api

**Does NOT own:**
- Any game state
- Rarities (rarity is assigned during ingest or manually during review)

**Operating mode:** primarily CLI (`python forge.py batch --config recipes.yaml`).
The FastAPI wrapper is a thin layer on top, needed only to trigger jobs
from the admin panel and view progress. Do not start with FastAPI; start with the script.

**It can be turned off.** The game works without it — the cards are already in the database.

## Communication

| From | To | How | When |
|---|---|---|---|
| game-ui | game-api | REST JSON | continuously |
| game-ui | game-api | `<img>` GET | art loading |
| card-forge | game-api | REST POST | after batch generation |
| card-forge | file system | write PNG | during generation |

**No queues, brokers, or gRPC.** At this scale, they are pure overhead.
If a batch takes a long time, it is simply a long-running CLI process in the terminal,
not a reason to bring in RabbitMQ.

## Local Run

`docker-compose.yml` starts only Postgres. The rest use three terminals:

```bash
docker compose up -d postgres   # database
cd game-api  && npm run start:dev
cd game-ui   && npm run dev
cd card-forge && python forge.py batch   # if needed
```

SD in Docker on a laptop is unnecessary pain (GPU passthrough, image size ~8GB).
Run `card-forge` in a regular venv.

## Repository Structure

```
mini-game-sb/
  card-game-data/     ← this vault
  game-ui/
  game-api/
  card-forge/
  storage/            ← shared art folder (in .gitignore)
    cards/
    thumbs/
  docker-compose.yml
```
