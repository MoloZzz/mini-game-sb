---
tags: [product, economy, agent-context]
status: active
---

# Economy Context for Product Decisions

Back to [[00 - Card Game MOC]] · Full mathematics → [[12 - Game Design - Economy Rebalance]] · Guardrails → [[13 - Product - Context & Guardrails]]

## Economy goal

The economy should support collecting: provide enough openings at the start, reward collection breadth in the middle, and not print infinite coins at the end. This is not real-money monetization.

## Current model

| Element | Role | Status that must not be lost |
|---|---|---|
| Coins | soft currency for cases | every change is written to the ledger |
| Keys | rare currency for better cases | likewise ledger-backed |
| Duplicates | variable return from openings | only copies beyond the last one may be sold |
| Daily bonus | primary pacing control at the start | 800 coins + 2 keys / 24h; exact source — shared types |
| Milestones | reward for unique cards | one-time, not rolled back when the pool grows |
| Cases | primary spend and way to obtain a card | their value must not disappear because of a new system |

## Most important formula

Sale EV depends on the already collected share of the pool, not only on the odds:

```
EV = Σ w_r × sellValue_r × (owned_r / pool_r)
```

Therefore, raising `sellValue` helps almost nothing at the start, but can break the economy with a complete collection. Full measurement and rationale → [[12 - Game Design - Economy Rebalance]].

## Required check for a new system

Before recommending a shop, NPC auction, crafting, or a new reward, describe:

1. **Source / sink:** what creates and what spends coins, keys, cards, or time.
2. **Three player states:** new, mid-collection, and near-complete collection.
3. **Impact on the core loop:** whether the case remains the main source of excitement and collection.
4. **Invariants:** ledger, server authority, last copy, monotonic milestones.
5. **Constraints:** one tuning control per pass; do not change prices, sell value, and bonus together without a model.

## Hints by idea type

- **Shop:** a safe MVP is a rare targeted purchase for existing currency with a limit/rotation; the dangerous version is a permanently cheaper path to the collection that displaces cases.
- **NPC auction:** this is a separate currency sink. It needs a lot-spawn rule, reserve price, frequency, rarity limit, and a way not to turn it into a better case.
- **P2P market:** not a small economic “feature,” but a scope change requiring liquidity, anti-fraud, moderation, and new ownership rules.
- **Crafting:** it consumes instances, so from the first commit it must preserve the last copy and requires new EV modeling.
