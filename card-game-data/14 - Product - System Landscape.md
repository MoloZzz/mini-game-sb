---
tags: [product, systems, agent-context]
status: active
---

# Product System Landscape

Back to [[00 - Card Game MOC]] · Guardrails → [[13 - Product - Context & Guardrails]] · Strategy → [[18 - Product - Strategy]] · Jobs → [[19 - Product - Jobs To Be Done]] · Decision format → [[17 - Product - Solution Brief Template]] · Backlog → [[22 - Product - Opportunity Backlog]]

Status matters more here than the idea's name. **Implemented** — it can be relied on as a fact. **Planned** — it is a direction, not a promise. **Open** — agents must name assumptions. **Out of scope** — it requires a separate product-owner decision.

| System | Status | Value for the player | Main constraint / source of truth |
|---|---|---|---|
| Case opening and reveal | Implemented | short tension peak and collectible drop | [[04 - Game Design - Core Loop]], [[05 - Game Design - Rarity & Drop Rates]] |
| Inventory, filters, duplicate sales | Implemented | see the collection, turn duplicates into coins | do not sell the last copy; `player_cards` are separate instances |
| Collection milestones | Implemented | compensate for weak duplicate returns at the start | one-time, monotonic, ledger-backed; [[12 - Game Design - Economy Rebalance]] |
| Daily bonus | Implemented | gentle return cadence without energy/timers | primary economy pacing control |
| Manual art review | Implemented | quality and pool control | only `approved` cards are available to players |
| Themed sets | Implemented: Ashen Wastes MVP | short collection goal and themed case loop | 20 cards, `set_id`-scoped Cinderbound Cache and `owned / total`; no completion reward; local playtest required before scaling |
| Duplicate crafting / merging | Planned, phase 2 | alternative use for duplicates | cannot consume the last copy; full rebalance required; [[11 - Planning - Open Questions]] Q8 |
| Shop for internal currency | Open | controlled choice or targeted purchase | first define a new sink/source and do not devalue cases |
| NPC auction | Open | rare controlled choice without other players | this is not a P2P market; spawn rules, prices, and a currency sink are required |
| P2P auction / trading | Out of scope | social economy | requires multiplayer, security, moderation, and a different economy |
| Lore, story, factions | Open | emotional reason to collect cards and sets | canon is not yet defined; [[16 - Product - Narrative Bible]] |
| Combat / PvP | Out of scope | separate game | do not use current ATK/DEF as a foundation without a new product decision |

## Quick fork for common requests

- **“Let’s make an auction”** → first ask whether it is NPC or P2P. By default, only the NPC version is allowed.
- **“Let’s make a shop”** → name the items, currency, frequency, and why the case remains desirable.
- **“Rebalance the economy”** → do not change one number without modeling the early, mid, and complete collection.
- **“Write the lore”** → do not present new factions or events as established canon; offer them as options for approval.
- **“Add progression”** → check whether it strengthens collecting rather than quietly turning the game into a battle/PvP product.
