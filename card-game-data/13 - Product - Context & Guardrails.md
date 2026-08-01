---
tags: [product, canon, agent-context]
status: active
---

# Product Context & Guardrails

Back to [[00 - Card Game MOC]] · Systems → [[14 - Product - System Landscape]] · Economy → [[15 - Product - Economy Context]]

## How to read this document

- **Fact** — confirmed by code or the current design.
- **Decision** — a deliberately chosen boundary; do not bypass it silently.
- **Open** — insufficient data; name assumptions and provide options in the proposal.

## Product promise

**Fact:** this is a local fantasy card-collection game about a short, tense cycle: choose a case → open it → experience the reveal → expand the collection → return for the next opening. The target from click to click is approximately ten seconds. Details → [[04 - Game Design - Core Loop]].

The main value is not monetary winnings, but the feeling of collecting, a rare drop, and gradually filling a set. Any new system must either strengthen this cycle or provide a meaningful choice around it.

## Current boundaries

| Thesis | Status | Consequence for the product decision |
|---|---|---|
| One local product, not a live-service | Decision | Do not assume server-side economy, moderation, or operations teams without an explicit scope expansion. |
| There is no real money | Decision | The shop, auction, and prices may operate only under internal currency rules. |
| PvP, combat, and card gameplay are absent | Decision | ATK/DEF are flavor for now; do not build progression on combat power. |
| There is no player-to-player trading | Decision | “Auction” cannot be quietly interpreted as a P2P market. First separate the NPC auction from a future multiplayer market. |
| The core loop is already implemented | Fact | A new feature must not duplicate `open case → reveal → inventory` without providing other value. |
| The economy has a ledger and server authority | Fact | A new currency source or sink requires a transaction, ledger entry, and invariant checks. |

## Rules that are immutable for now

1. A card reaches the player only after a server decision; the UI does not determine RNG.
2. The collection counts unique **unsold** cards. The last copy cannot be sold.
3. The value of duplicates is a path to subsequent openings, but they must not turn cases into an infinite currency generator.
4. New content follows `generation → draft → manual review → approved`; draft is not a player reward.
5. If an idea changes how cards are obtained or destroyed, it changes the economy and milestones — read [[15 - Product - Economy Context]] before deciding.

## Rule for proposals

Before recommending a new product system, explicitly show:

- the player problem or opportunity it solves;
- how it returns to the core loop;
- what is a fact, an assumption, and a new decision;
- which current boundaries it breaks or preserves;
- the smallest testable version and success metric.

If the required product fact does not exist, do not invent it as canon: mark it `Open` and propose 2–3 controlled options.
