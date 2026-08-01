---
tags: [gamedesign]
---

# Game Loop and Economy

Back to [[00 - Card Game MOC]] · Rarity numbers → [[05 - Game Design - Rarity & Drop Rates]]

## Loop

```
     ┌──────────────────────────────────────────┐
     │                                          │
     ▼                                          │
 [Case Lobby]                                   │
     │ click on case                            │
     ▼                                          │
 [Price Confirmation] ──── insufficient ──► [Sell Duplicates]
     │ open                                     ▲
     ▼                                          │
 [ROULETTE ~5.5s]                                │
     │                                          │
     ▼                                          │
 [Card Reveal + Rarity FX]                      │
     │                                          │
     ├──► “Again” ─────────────────────┐        │
     │                                 │        │
     ▼                                 │        │
 [Inventory] ─────────────────────────►┴────────┘
```

The entire cycle from click to click is under 10 seconds. That is the essence of the genre:
short, dense, with a clear peak of tension in the middle.

## Screens

### 1. Lobby
- Case grid (2–4 are enough)
- Coin and key balance in the header, with number-change animation
- “Recent drops” reel at the bottom — from `GET /me/drops`
- Click a case → show odds and an open button

### 2. Roulette
Full focus. Dim the background; the lobby goes blurry.
Animation details → [[08 - UI - Roulette Spec]]

### 3. Reveal
- The card flies out from the center of the reel and scales up
- Rarity effect: from nothing (common) to particles and screen shake (mythic)
- “NEW” badge for the first instance, “×3” for a duplicate
- Two buttons: “Again” (the same case, immediately) and “To Inventory”

**“Again” should be the primary button.** The largest, centered, autofocus.
This is what the entire genre exists for.

### 4. Inventory
- Grid grouped by card, copy counter
- Filter by rarity and element, sorting
- Collection progress: “28 / 110 cards” + breakdown by rarity
- Click a card → details, sell button (if copies > 1)

### 5. Admin / Card Review (for you, not the player)
- Grid of draft cards from `card-forge`
- For each: approve / reject, name field, rarity, stats
- Shows the prompt and seed so you can see which recipes work

This screen is not optional. Without it, you will edit cards with SQL.

## Currencies

**Coins** — soft currency. The main one. Given generously.
**Keys** — hard currency. Rare. Opens better cases.

Two currencies, not one: this gives two different feelings when opening.
Three or more is accounting, not a game.

### Income Sources

| Source | Gives | Frequency |
|---|---|---|
| Starting grant | 1000 coins, 5 keys | once |
| Daily bonus | 500 coins, 1 key | every 24 hours |
| Duplicate sale | by rarity, see below | anytime |
| Collection milestones | 200–2000 coins | by progress |

The daily bonus is simply a check of `last_claim_at` on `GET /me`.
No cron is needed.

### Prices and Sale Values

| Rarity | Sale (coins) |
|---|---|
| Common | 15 |
| Uncommon | 40 |
| Rare | 100 |
| Epic | 300 |
| Legendary | 900 |
| Mythic | 3000 |

| Case | Price | Profile |
|---|---|---|
| Starter Chest | 100 coins | baseline odds |
| Ember Vault | 350 coins | no common, shifted upward |
| Arcane Reliquary | 1 key | best odds, mythic ×5 |

### Balance Mathematics

Expected sale value of a Starter Chest
(weights from [[05 - Game Design - Rarity & Drop Rates]]):

```
EV = 0.600×15 + 0.220×40 + 0.120×100 + 0.045×300 + 0.013×900 + 0.002×3000
   = 9.0 + 8.8 + 12.0 + 13.5 + 11.7 + 6.0
   = 61 coins
```

Price 100 → **61%** return. This is deliberately a “loss-making” bet, and that is correct:
the real reward is the card in the collection, not the coins. If EV equaled the price,
money would stop being a constraint and every decision would lose its weight.

Daily 500 coins + duplicate sales means ≈ **10–14 cases per day** consistently.
Enough to stay busy, not enough to collect everything in one evening.

**Invariant for checking the economy:**
```sql
SELECT p.id, p.balance_coins, SUM(t.delta_coins) AS ledger_sum
FROM players p JOIN transactions t ON t.player_id = p.id
GROUP BY p.id, p.balance_coins
HAVING p.balance_coins <> SUM(t.delta_coins);
```
An empty result means the economy is intact. Run this in tests.

## Protection Against Boredom

**Pity system.** If 30 openings in a row have no epic+, the next one
is guaranteed to be epic or higher. Counter in `players.pity_counter`,
reset on an epic+ drop.

This is not a “cheat for the player” — it is an industry standard (gacha, CS:GO, Hearthstone).
Without it, a long dry streak kills the session. With it, the worst possible
experience is bounded.

**Duplicates have value.** Each duplicate is coins toward the next case.
So “the same rat again” is annoying, but not a total loss.

## What NOT to Do at This Stage

- **Battles / PvP** — this is a separate game, twice as large as this one. `attack`/`defense`
  currently exist only as flavor on the card.
- **Crafting / card fusion** — a tempting feature, but it requires rebalancing the entire
  economy. Noted in [[11 - Planning - Open Questions]].
- **Real money** — even as a mock. This is not that project.
- **Time limits / energy** — the daily bonus already fills this role more gently.
