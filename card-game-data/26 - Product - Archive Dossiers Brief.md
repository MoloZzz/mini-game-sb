---
tags: [product, economy, solution-brief]
status: proposal
---

# Archive Dossiers · solution brief

Назад до [[00 - Card Game MOC]] · Decision → [[10 - Planning - Decisions#ADR-018]] · Evidence → [[21 - Product - Evidence Log]] · Opportunity → [[22 - Product - Opportunity Backlog]]

## 1. Context retrieval

- **Fact:** the 10,000-run seeded model reaches a no-affordable-case state
  under the declared current-economy policy → [[21 - Product - Evidence Log#E-2026-07-29-02]].
- **Decision:** the product will explore a longer voluntary opening session
  through a bounded, non-timed activity source → ADR-018.
- **Assumption:** collectors will find curation of their own cards more
  meaningful than a generic reward button. No player evidence establishes
  this yet.

## 2. Player problem and outcome

When a collector cannot afford another case, they need a real activity that
uses the collection they already built and can lead to one more opening now.
The intended flow is:

`collection cards → archive three Notes → Archive Pass → Archive Cache → reveal → new card expands future Note options`

This is a **task** system: it answers “what can I do in this session?” It is
not a collection completion reward or an achievement.

## 3. Options considered

| Option | Flow | Score | Why not selected for MVP |
|---|---|---:|---|
| Archive Notes | archive three previously undocumented unique cards as one dossier; earn one Archive Pass | `4 × 5 × 2 / 4 = 10` | Selected proposal; bounded by unregistered unique cards |
| Duplicate refinery | consume duplicates for a key/resource | `3 × 4 × 2 / 4 = 6` | fails the early soft lock; changes last-copy/crafting economy |
| Repeatable standalone minigame | play unrelated loop for coins | `3 × 5 × 1 / 5 = 3` | expands the game away from collecting and risks an infinite faucet |

Confidence is weak for every option: only the currency model and external
mechanism research exist, not a local player test.

## 4. Proposed smallest MVP

### Player flow

1. The lobby has a separate **Archive Notes** task card; it is always optional.
2. The player selects any three distinct, unsold unique cards that have not
   previously been archived as Notes. The UI calls out their shared element or
   archetype when one exists, but never makes a rare combination mandatory.
3. The server records the three Notes as a dossier and awards exactly one
   **Archive Pass**.
4. An Archive Pass opens one **Archive Cache**, using the global approved pool
   and the existing Starter Chest odds/reveal presentation. The pass cannot
   buy any other case and has no real-money value.
5. The three cards remain in the collection. They are not sold, locked or
   consumed; the archive simply cannot create a second Note from the same
   discovery. A newly acquired unique card is eligible for a future Note.

### Economy model and state rules

- **Source:** at most one Archive Note per unique unsold card. This is an
  economic cap first and light lore second: the archive has already recorded
  that discovery, so it cannot print another pass from it.
  Therefore the maximum number of passes created from a fixed collection is
  `floor(undocumented unique cards / 3)`; a three-card source cannot produce
  a self-sustaining opening loop because each Archive Cache supplies at most
  one new unique card.
- **Sink:** one Archive Pass is atomically consumed by one Archive Cache.
  It is not `coins`, `keys`, a purchasable item or a conversion of cards.
- **New:** existing unique cards begin undocumented; this gives a stranded
  account a finite recovery path without waiting.
- **Middle/end:** new unique cards arrive less often, so the pass source
  naturally slows; duplicate sale and existing goals remain relevant.
- **Authority:** dossiers, passes and pass-openings are server state. Creating
  a dossier locks the player and rejects duplicate card IDs, sold cards,
  another player's cards and already-documented cards. Archive opening keeps
  server RNG, idempotency and a traceable opening row. Any coins/keys changed
  by a normal opening still obey ledger invariants.

### Explicit MVP exclusions and future tracks

No timer, daily reset, streak, expiry, leaderboard, paid pass, coin/key
grant, card destruction, hidden eligibility, choice that alters odds, or
separate combat/minigame **in this MVP**. This does not reject future P2P
trading/auctions, streaks or paid services: they are separate product tracks
that need their own multiplayer, economic, policy and legal design. The
Archive Notes MVP is intentionally isolated so it can be evaluated before
those systems change the same behaviour. It creates no new lore canon beyond
the neutral archive framing.

## 5. Learning experiment

- **Segment hypothesis:** collector.
- **Primary observation:** at a no-affordable-case state, can a participant
  explain why they selected those cards and what the pass will do, without a
  prompt?
- **Guardrails:** report of pressure/confusion; net coins/keys per session;
  unique cards per Archive Cache; modelled pass source remains bounded.
- **Smallest exposure:** two independent scripted local playtests. Compare
  transparent zero-state control with dossier flow; counterbalance order.
- **Prompts:** “What would you do now and why?”, “Why these cards?”, “What do
  you think the pass permits?”, “Does this feel like a choice or an
  obligation?”
- **Scale:** both participants understand the pass and describe the dossier
  as a voluntary use of their collection; model shows no positive long-run
  pass drift.
- **Revise:** they understand it but call it a meaningless three-click chore.
- **Stop:** they report pressure, cannot explain the boundary, or it requires
  a repeatable currency faucet to feel useful.

## 6. Implementation boundary if approved

Shared contracts first; then a migration for dossier/pass state; API actions
and server-side eligibility/opening; UI task card and archive flow; MSW mocks;
unit/e2e invariant tests; rerun the simulator with pass source enabled.
No implementation is authorised by this brief alone.
