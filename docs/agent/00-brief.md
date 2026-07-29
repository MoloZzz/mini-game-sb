# Project brief

## Purpose and scope

Local fantasy card-collection game: player opens a case → server selects a card → UI animates a fixed roulette → card enters inventory. Art is generated offline with Stable Diffusion; no generation occurs during play. The product is deliberately local/single-machine: no real money, PvP, player trading, mobile app, queues, or cluster deployment.

## Runtime map

| Area | Owns | Main entry |
| --- | --- | --- |
| `game-ui` | React screens, auth session, animation, MSW mock mode | `game-ui/src/App.tsx` |
| `game-api` | REST API, Postgres state, auth, economy, RNG | `game-api/src/app.module.ts` |
| `card-forge` | Offline SD batch, manifest, ingest client | `card-forge/forge.py` |
| `packages/shared-types` | DTOs and shared game constants | `packages/shared-types/src/index.ts` |

The API is mounted under `/api`; it serves artwork from `/static`. Postgres is the only Docker service. API, UI, and forge run natively.

## Read the right amount

Start with this file, then use the routing table in [`AGENTS.md`](../../AGENTS.md). Prefer the source file named in a pack over broad searches. `card-game-data/` is an Obsidian design vault: useful for why a decision was made, not the source of present behaviour.

## Current product flow

`Lobby` → `OpenCaseScreen` → `POST /cases/:slug/open` → 60-tile reel → `Inventory`.

Authentication is mandatory except for explicit public routes. Card art moves through `card-forge` → service-token ingest as `draft` → admin review → `approved` pool. Only approved cards can appear to players.

## Known seam

The register/login response types currently live in `game-api/src/auth/types.ts` and are duplicated in `game-ui/src/lib/api.ts`; all other cross-service DTOs belong in `packages/shared-types`. Move that auth contract there before adding a third copy.
