---
tags: [gamedesign, math, economy]
---

# Economy Rebalance

Back to [[00 - Card Game MOC]] · Base mathematics → [[04 - Game Design - Core Loop]] · Rarities → [[05 - Game Design - Rarity & Drop Rates]]

## The problem we measured

[[04 - Game Design - Core Loop]] promised an EV of 61 coins from a 100-coin Starter Chest. In the real game, with a pool that grew to 432 cards, the measured EV is **1.70 coins (1.7%)**.

**Reason:** the `LAST_COPY` rule prevents selling a card if you have only one copy. A sale pays only for a card you **already own**. The drop sale-value formula is not simple weight-times-price, but weight-times-price-times-the-chance-that-you-already-own-it:

```
EV = Σ w_r × sellValue_r × (owned_r / pool_r)
```

`owned_r / pool_r` is the share of rarity `r`'s pool that the player has already collected. At the start it is nearly zero for everything except common — so actual EV collapses, even though the drop weights and sale prices remain those designed for a 110-card pool.

### Measurement on Starter Chest, ~19 cards owned

```
common     0.600 × 15   × 12/180 = 0.60
uncommon   0.220 × 40   ×  4/108 = 0.33
rare       0.120 × 100  ×  2/64  = 0.38
epic       0.045 × 300  ×  1/35  = 0.39
legendary  0.013 × 900  ×  0/30  = 0
mythic     0.002 × 3000 ×  0/15  = 0
                                    1.70 coins out of 100 (1.7%)
```

The `180/108/64/35/30/15` pool (=432) is the real number of approved cards by rarity (the proportions from `POOL_SEED_RATIOS`, the same 40/30/20/12/6/2 as in [[05 - Game Design - Rarity & Drop Rates]], simply at a new scale).

**Root cause:** the pool grew from 110 to 432 cards, while all economic constants (daily bonus, case prices, `sellValue`) remained calibrated for 110. With the old daily bonus of 500 coins, this bought **5.1 openings per day** instead of the planned ~13.

## Fix

### 1. Collection milestone ladder

A second, independent reward channel pays for collection **breadth** (how many different cards have been collected), rather than duplicates, which simply do not exist at the start. Source: `packages/shared-types/src/milestones.ts`.

| Tier | Unique cards | Coins | Keys |
|---|---|---|---|
| unique_10 | 10 | 200 | 0 |
| unique_25 | 25 | 300 | 1 |
| unique_50 | 50 | 500 | 1 |
| unique_75 | 75 | 700 | 1 |
| unique_100 | 100 | 900 | 2 |
| unique_150 | 150 | 1200 | 2 |
| unique_200 | 200 | 1500 | 3 |
| unique_250 | 250 | 1800 | 3 |
| unique_300 | 300 | 2000 | 4 |
| unique_350 | 350 | 2000 | 4 |
| unique_400 | 400 | 2000 | 5 |
| unique_432 | 432 | 2000 | 10 |

**Total: 15,100 coins + 36 keys for the full collection.**

**Thresholds are an ABSOLUTE number of unique cards, never a percentage of the pool.** A percentage would retroactively “redistribute” already earned milestones whenever a new batch of cards is generated — a player who had already completed a tier would see it become incomplete again. Tier 12 is intentionally **frozen at 432** — the pool size when the ladder was written — for the same reason: future pool growth is a deliberate content decision that should add tier 13 with a new number, not quietly shift tier 12's target.

### 2. One tuning control: `DAILY_BONUS`

`DAILY_BONUS` (`packages/shared-types/src/player.ts`) was raised **500 → 800 coins, 1 → 2 keys**. This is the only change to reward denominations in this pass, besides the milestone ladder itself — `sellValue` and case prices (except one, see below) were deliberately left untouched.

### 3. Resulting ramp

| Stage | Sale EV | milestones | total | net price (100-coin case) | openings/day @ 800 |
|---|---|---|---|---|---|
| Start (19 unique) | 1.7 | 26 | 27.7 | 72.3 | 11.1 |
| Middle (~216) | 30.5 | 17 | 47.5 | 52.5 | 15.2 |
| Full (432) | 61 | 0 | 61 | 39 | 20.5 |

A monotonic ramp of **11 → 15 → 20 openings per day** starts immediately within the project range of “10–14 per day” from [[04 - Game Design - Core Loop]], rather than falling below it as it did with the old bonus.

## Why `sellValue` was NOT increased

`sellValue` is multiplied by `owned_r / pool_r` — the share that goes from nearly zero at the start to nearly one with a complete collection. Increasing `sellValue` means raising both ends at once:

- At the start, it changes almost nothing (`owned_r / pool_r ≈ 0`).
- With a complete collection, Starter Chest EV already equals 61 against a price of 100. Doubling `sellValue` gives EV ≈ 122 > 100 — the case becomes a **coin-printing machine** exactly when the player has the most cards to sell.

The loss-making sale margin at full collection is the only thing that keeps coins scarce at all. Therefore, the only tuning control is the daily bonus, not sale value.

## Stoneheart Coffer: 180 → 120

At a price of 180, this case was **strictly dominated**: more expensive than Starter Chest (100 coins) and with worse odds — the EV-to-price ratio was only **34%** versus **61%** for Starter Chest. No rational player had a reason to buy it.

At 120, the ratio becomes **51%**, and the narrower rare-rarity band gives a measurably faster collection rate for a player who chooses it.

This had to be implemented as a **real migration** (`UpdateStoneheartCofferPrice`), not just a `CASE_SEEDS` constant change: `seedCases` skips slugs already present in the database, so changing only the constant would never reach an already-seeded database.

## Related

- Milestones and ladder → ADR-014 is unrelated; see [[10 - Planning - Decisions]] ADR-015 (where `pool_r` comes from)
- Ledger invariant after mass duplicate sale → [[10 - Planning - Decisions]] ADR-016
