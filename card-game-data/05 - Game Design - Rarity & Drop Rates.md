---
tags: [gamedesign, math]
---

# Rarities and Odds

Back to [[00 - Card Game MOC]] · Economy → [[04 - Game Design - Core Loop]]

## Six Tiers

| Rarity | Color | Hex | Pool target | Sale | ATK/DEF |
|---|---|---|---|---|---|
| Common | gray | `#9CA3AF` | 40 cards | 15 | 1–4 |
| Uncommon | green | `#22C55E` | 30 | 40 | 3–7 |
| Rare | blue | `#3B82F6` | 20 | 100 | 6–10 |
| Epic | purple | `#A855F7` | 12 | 300 | 9–14 |
| Legendary | gold | `#F59E0B` | 6 | 900 | 13–18 |
| Mythic | red-pink | `#EC4899` | 2 | 3000 | 17–22 |

**Total target pool: 110 cards.** This is a realistic size for local
generation — and it already feels like a collection.

Six tiers is a deliberate choice. Five is the standard, but the sixth (Mythic)
gives the same effect as “red” in CS:GO: an almost unattainable top tier
that everyone knows about. At seven or more, the tiers stop being distinguishable.

The color scheme deliberately matches the MMO/CS:GO convention. Do not invent your own;
the player reads rarity from the color before reading the word.

## Case Weights

The sum of each row = 100.

### Starter Chest — 100 coins

| Rarity | % | 1 in |
|---|---|---|
| Common | 60.0 | 1.7 |
| Uncommon | 22.0 | 4.5 |
| Rare | 12.0 | 8.3 |
| Epic | 4.5 | 22 |
| Legendary | 1.3 | 77 |
| Mythic | 0.2 | 500 |

### Ember Vault — 350 coins

| Rarity | % | 1 in |
|---|---|---|
| Common | 0.0 | — |
| Uncommon | 45.0 | 2.2 |
| Rare | 33.0 | 3.0 |
| Epic | 15.0 | 6.7 |
| Legendary | 6.0 | 17 |
| Mythic | 1.0 | 100 |

### Arcane Reliquary — 1 key

| Rarity | % | 1 in |
|---|---|---|
| Common | 0.0 | — |
| Uncommon | 20.0 | 5.0 |
| Rare | 38.0 | 2.6 |
| Epic | 27.0 | 3.7 |
| Legendary | 12.0 | 8.3 |
| Mythic | 3.0 | 33 |

**The “1 in” column is mandatory in the UI.** “0.2%” is abstract. “1 in 500”
is a feeling. The latter is more honest and more interesting at the same time.

## Roll Algorithm

```
1. Take the case weights (jsonb from the `cases` table)
2. If `pity_counter >= 30` → discard common/uncommon/rare,
   renormalize the epic/legendary/mythic weights to 100
3. Remove rarities with an empty approved pool and renormalize
4. `r = random() * 100`, cumulative sum → choose a rarity
5. Choose a random approved card of that rarity (uniform)
6. Update `pity_counter`: +1, or 0 if epic+ dropped
```

**Step 3 is critical.** If you have not generated a single mythic yet but the RNG
selects mythic, there will either be a crash or a silent fallback that breaks the statistics.
Check the pool BEFORE the roll, not after.

**RNG:** `crypto.randomInt` from Node, not `Math.random()`. Not because anyone
will cheat, but because it is one line of difference and is correct immediately.

## Provably Fair (stretch, not for M1)

Classic iGaming scheme:

```
server seed is generated in advance
SHA256(server_seed) is shown to the player   ← before opening
result = HMAC-SHA256(server_seed, `${client_seed}:${nonce}`)
                → first 8 hex → number → % 10000 → rarity
server_seed is revealed after opening
the player can verify the hash and recalculate the result
```

You are the player here, so there is no practical need. But this is the most interesting
technical detail of the genre and can be implemented in an hour. Noted in
[[11 - Planning - Open Questions]] as desirable.

## Reel Construction (60 Tiles)

This is purely cosmetic, but it determines whether the roulette looks alive.

```
Indices 0–54, 56–59: fillers
Index 55:            winning card
```

**The filler distribution is NOT the same as the drop weights.** If you use the real
weights, the reel will have 36 gray tiles in a row and no gold — it looks
cheap and uninteresting.

Filler recipe:
```
common     35%
uncommon   28%
rare       22%
epic       11%
legendary   3.5%
mythic      0.5%
```

Rules:
- Guarantee **at least 2 legendary+** in the reel, spread across positions 10–50
- **No legendary/mythic at indices 53, 54, 56, 57** — otherwise the winner’s neighbor
  will steal attention at the moment of stopping
- Do not place two identical cards next to each other
- If the win is rare or lower, still keep gold in the reel.
  Passing a legendary without stopping is the same near-miss
  on which the entire genre is built

**Fairness note:** near-miss is a manipulative mechanic, and that is why it is regulated
in real gambling products. Here there is one player, the stakes are not real,
and you know how it works. But it is worth understanding what you are building.

## Probability Verification

Required test before trusting the numbers:

```ts
it('drop rates match configured weights within tolerance', () => {
  const N = 200_000;
  const counts = tally(range(N).map(() => rollRarity(STARTER_WEIGHTS)));
  expect(counts.common / N).toBeCloseTo(0.600, 2);
  expect(counts.epic   / N).toBeCloseTo(0.045, 3);
  expect(counts.mythic / N).toBeCloseTo(0.002, 3);
});
```

At N=200k, the standard error for mythic (p=0.002) is ≈ 0.0001, so
`toBeCloseTo(_, 3)` will pass reliably. For smaller N this test will be flaky;
do not reduce N; put it in a separate slow suite instead.

Separately, test that the sum of each case’s weights == 100 and that pity triggers
exactly on the 30th dry opening.
