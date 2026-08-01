---
tags: [moc]
status: planning
---

# Mini Card Game — Map of Content

Local fantasy card game with cases and a horizontal roulette.
Cards are generated locally through Stable Diffusion 1.5.

## In One Sentence

The player spends currency → opens a case → the horizontal roulette spins
and stops on a card → the card goes into the inventory.

## Three Services

| Service | Stack | Role |
|---|---|---|
| `game-ui` | React + TS + Vite + Framer Motion | Everything the player sees |
| `game-api` | NestJS + TypeORM + Postgres | Catalog, inventory, economy, RNG, static assets |
| `card-forge` | Python + FastAPI + diffusers | Offline SD 1.5 art generation |

Details → [[01 - Architecture - Services]]

## Navigation

### Architecture
- [[01 - Architecture - Services]] — service boundaries, why exactly 3
- [[02 - Architecture - Data Model]] — Postgres schema
- [[03 - Architecture - API Contracts]] — endpoints and formats

### Game Design
- [[04 - Game Design - Core Loop]] — game loop, screens, economy
- [[05 - Game Design - Rarity & Drop Rates]] — rarities, weights, mathematics
- [[12 - Game Design - Economy Rebalance]] — measured EV failure, milestones, ramp repair

### Generation
- [[06 - Generation - SD Pipeline]] — model, batch, review
- [[07 - Generation - Prompt Recipes]] — prompt templates

### UI
- [[08 - UI - Roulette Spec]] — roulette mathematics and timing

### Planning
- [[09 - Planning - Roadmap]] — M0–M6 milestones
- [[10 - Planning - Decisions]] — ADRs, recorded decisions
- [[11 - Planning - Open Questions]] — what remains unresolved

### Product Context for Decisions
- [[13 - Product - Context & Guardrails]] — product value, scope, and immutable constraints
- [[14 - Product - System Landscape]] — what is implemented, planned, blocked, or unknown
- [[15 - Product - Economy Context]] — a brief economy model and rules for new sources/spending
- [[16 - Product - Narrative Bible]] — established lore and a safe way to work with gaps
- [[17 - Product - Solution Brief Template]] — solution format for a new system
- [[18 - Product - Strategy]] — product goal, working segments, and useful-feature criteria
- [[19 - Product - Jobs To Be Done]] — hypotheses about player needs to validate
- [[20 - Product - Metric Tree]] — metric tree and local event plan
- [[21 - Product - Evidence Log]] — log of verifiable observations and playtests
- [[22 - Product - Opportunity Backlog]] — hypotheses, MVPs, and prioritization rules
- [[23 - Product - Monetization Policy]] — current internal-currency boundaries and conditions for changing scope

## Two Decisions That Defined the Entire Architecture

**1. Generation never happens during gameplay.**
SD 1.5 on a laptop takes seconds (GPU) or minutes (CPU). The roulette spins for 5 seconds.
So cards are generated in advance into a pool, and the game simply draws from that pool.
This completely decouples slow Python from the fast game loop — they
do not even need to be running at the same time.

**2. RNG lives on the server, not in the UI.**
`game-api` decides which card dropped BEFORE the animation starts and gives the UI
a ready reel with the winner at a known position. The UI simply spins to it.
Real iGaming/CS:GO case sites work the same way.
