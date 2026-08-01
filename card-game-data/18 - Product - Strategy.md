---
tags: [product, strategy, agent-context]
status: active
---

# Product Strategy

Back to [[00 - Card Game MOC]] · Jobs → [[19 - Product - Jobs To Be Done]] · Metrics → [[20 - Product - Metric Tree]] · Evidence → [[21 - Product - Evidence Log]]

## Knowledge statuses

- **Fact** — confirmed by code, the current design, or an evidence record.
- **Decision** — a current product boundary.
- **Hypothesis** — a plausible explanation that still needs testing.
- **Open** — the goal, segment, or success threshold has not been defined.

## Goal and boundaries

**Fact:** the game provides a short `case → reveal → collection` cycle; the main value is collecting, rare drops, and visible progress. Details → [[13 - Product - Context & Guardrails]].

**Decision:** the current product is local; real money, PvP, P2P trading, and live-service are out of scope. “Value people pay for” here means time, attention, and internal currency, not a payment. Policy → [[23 - Product - Monetization Policy]].

**Open:** who the game should be best for, which behavior should be reinforced first, and which numerical retention/engagement goals are sufficient. Do not establish them without [[21 - Product - Evidence Log|evidence]].

## Audience: working segments

This is not a description of real users: no segment has yet been validated. Use them only to formulate and test hypotheses.

| Segment hypothesis | Potential motivation | What to test in conversation or playtest |
|---|---|---|
| Looking for a short reveal | quick emotional peak without complex onboarding | whether the first case is clear; whether they want to open another |
| Collector | see an incomplete set and move it toward completion | whether missing cards and the next achievable goal are noticeable |
| World explorer | collect cards as fragments of a world or story | whether card context creates a desire to collect a set rather than only read the text |

Do not turn a segment into a fact based on one response: record observations as separate entries in [[21 - Product - Evidence Log]].

## Useful-feature criterion

A feature must strengthen one job from [[19 - Product - Jobs To Be Done]], return to the core loop, and have a way to be checked in [[20 - Product - Metric Tree]]. A shop, NPC auction, crafting, sets, and story are possible solutions for a job, not goals in themselves; their status → [[14 - Product - System Landscape]].

## Strategic choice · 2026-07-29

**Owner decision:** the game is built around voluntary return to the next meaningful collection session, not around FOMO, timers, or artificial scarcity. The first working segment hypothesis is the **collector**, who wants to see an achievable goal, move toward it, and remember rare finds. This is not yet evidence of demand.

### Four different reasons to play

| System | Player question | Horizon | What it does not do |
|---|---|---|---|
| Reveal / case | “What will drop now?” | minutes | does not set a long-term goal |
| Tasks | “What is interesting to do in this session?” | one session | is not a set or milestone |
| Collections | “What do I want to complete?” | days / weeks | must not impose an entry frequency |
| Achievements | “What have I already mastered?” | forever | are not rotating tasks |

Story context answers “why is this find important?” and should strengthen collections rather than distract from the loop. The economy should give the player the right to make the next attempt without turning duplicates or currency into a hidden barrier.

### Bet sequence

1. **Make the goal clear:** separate Collection and Achievements; Ashen Wastes tests whether the set explains the next case.
2. **Test session tasks:** one optional “expedition” per session with a choice between two directions, without a streak, timer, or new currency. Its purpose is to give a reason to try another case or return to the collection.
3. **Only after that** add a new set and story fragment as a long-term goal.
4. Consider crafting, shop, and NPC auction only when the playtest shows that duplicates or the missing goal really stop the loop.

**Decision clarification · 2026-07-29:** after seeded currency-continuity modeling, the owner confirmed a different session shape: the game should explore a longer voluntary case loop through one bounded, untimed activity source, not only through a larger starting grant. This does not change the boundaries against FOMO or an infinite currency faucet; the exact MVP → [[26 - Product -
Archive Dossiers Brief]].

Compared options for step 2: daily tasks (reach 3 × impact 4 × confidence 2 / effort 3 = **8**) versus session expeditions (4 × 5 × 2 / 4 = **10**). Confidence is weak for both: evidence is absent. Expeditions were chosen because they test motivation without calendar pressure and do not create a “mandatory” entry.

### Value and future willingness to pay

**Current decision:** real money is out of scope; `coins` and `keys` are game resources only. The product must first prove voluntary spending of time, attention, and soft currency on a set, expedition, or cosmetic self-expression.

If scope ever changes, value should be tested in this order:

1. cosmetic identity (frames, case skins, collection presentation);
2. authored thematic content packs with transparent contents;
3. only after a separate decision — any other offering.

Never make these future paid value: card power, better drop odds, access to core collection goals, or removal of intentionally created friction. Any paid mechanic remains out of scope until the conditions in [[23 - Product - Monetization Policy]] are met.

**Owner direction · 2026-07-29:** P2P exchanges/auctions, streak mechanics, and paid services are considered future strategic directions, not rejected ideas. This is not yet a scope decision to implement them: P2P requires a multi-user market model, while paid services require separate policy, payment, and legal research. Archive Notes must be reviewed without them so voluntary loop value is not confused with calendar or payment pressure.

### How to prove or disprove the strategy

The first playtest shows the set goal after the reveal and asks: “What will you do next, and why?” In the next test, replace one session with an expedition and compare it with a control session: primary — `case_opened → reveal_completed →
collection_viewed`; guardrails — new unique cards per opening, net coins/keys per session, and the response about pressure/confusion. Baseline and numerical thresholds are open; do not claim retention lift without sufficient D1/D7 cohorts.
