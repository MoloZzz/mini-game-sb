---
tags: [product, evidence, research, agent-context]
status: active
---

# Evidence log

Back to [[00 - Card Game MOC]] · Strategy → [[18 - Product - Strategy]] · Metrics → [[20 - Product - Metric Tree]] · Ideas → [[22 - Product - Opportunity Backlog]]

## Log rule

This is where verifiable observations are stored, not assumptions, attractive ideas, or untested advice. The log currently contains **no validated player evidence**. Do not infer anything about players from that.

The source must allow the context to be checked without storing unnecessary personal data. Anonymize the player; do not record email, tokens, passwords, full logs, or sensitive free text without consent.

## Evidence

Add one entry per observation. Do not edit an old result so that it disappears: record a newer entry that clarifies or refutes it.

### E-2026-07-29-01 · Desk research: collection-session continuity

- **Date:** 2026-07-29
- **Status:** raw
- **Type:** external research
- **Source and method:** independent desk review of six narrow areas with
  validation against primary sources. [Hearthstone](https://news.blizzard.com/en-gb/article/23357896/ashes-of-outland-patch-17-0-march-26)
  documents duplicate protection within a set and rarity without changing rarity
  distribution; [MTG Arena](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-economy-2022-03-17)
  describes the economy as all ways of earning and spending resources across
  player stages; [Machinations](https://machinations.io/docs/framework-basics)
  formalizes source, pool, drain, and stochastic flow; [Nielsen Norman Group](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary_Letter_compressed.pdf)
  confirms requirements for state visibility and constructive recovery UX.
- **Sample:** not a study of our players; external products with different
  business models and one methodological/UX review.
- **Observation:** external examples use protected draws, finite guaranteed
  progress, and transparent rules as alternatives to waiting; they are not
  evidence of retention or demand in this local game.
- **Interpretation:** the soft-lock problem should be modelled and playtested
  separately from the desire for a longer session. Duplicate protection reduces
  lost progress, but by itself does not create funds for an opening at zero
  balance.
- **Related job / metric:** [[19 - Product - Jobs To Be Done]] —
  “turn excess into a meaningful next chance”; [[20 - Product - Metric
  Tree]] — net coins/keys per session, failed case-opening attempts, and the
  qualitative reason for stopping.
- **Limitations:** there is no local slice of the share of players below case
  price, no playtest sample, and no causal comparison of variants.
- **Next action:** first run seeded-RNG balance modelling for new, mid, and
  near-complete accounts; then compare a small onboarding runway with
  condition-based recovery in a scripted playtest.

### E-2026-07-29-02 · Seeded model of current session economy

- **Date:** 2026-07-29
- **Status:** raw
- **Type:** local event
- **Source and method:** `npm.cmd run simulate:economy --workspace game-api --
  --runs=10000 --max-opens=250` against the seeded local database. The model
  read 452 approved cards (`188/113/67/37/31/16` by rarity) and ten active
  cases. It always chose the cheapest affordable coin case, otherwise the
  cheapest key case; daily bonus was already claimed, so no wait-time income
  existed during the session.
- **Sample:** 10,000 deterministic simulated runs each for new, mid and
  near-complete inventories; this is a model of system rules, not players.
- **Observation:** with no duplicate sale, a new post-daily account reached
  a hard lock after 30.8 opens on average (worst run 27); mid and near-complete
  accounts stopped after 10. With immediate sale of every duplicate — an
  optimistic policy absent from the current UI — new accounts averaged 31.9
  opens, mid 18.4 and near-complete 31.6. Almost every run still reached a
  balance below the 100-coin Starter Chest before 250 opens.
- **Interpretation:** the current sources are a finite session budget, not a
  continuous-session economy. Duplicate sale improves the middle and end but
  cannot be the early-game recovery path.
- **Related job / metric:** [[19 - Product - Jobs To Be Done]] —
  “turn excess into a meaningful next chance”; [[20 - Product - Metric
  Tree]] — net coins/keys per session and failed case-opening attempts.
- **Limitations:** modelled case choice is not observed behaviour; it does not
  model UI comprehension, voluntary stopping, targeted Cinderbound Cache
  choice, manual inventory actions or future recovery mechanics.
- **Next action:** run a scripted playtest of the zero-balance state and
  obtain an owner decision on whether the product should support a finite
  opening session or a repeatable non-timed source of further opens.

```md
### E-<YYYY-MM-DD>-<XX> · <short title>

- **Date:** <TBD>
- **Status:** raw | reviewed | superseded
- **Type:** playtest | local event | interview | bug | external research
- **Source and method:** <where it arose and how it was collected; for events — snapshot/version name>
- **Sample:** <number of sessions/participants; selection method; unknown biases>
- **Observation:** <only what happened or was said>
- **Interpretation:** <what it may mean; do not present it as fact>
- **Related job / metric:** <link to JTBD and Metric Tree>
- **Limitations:** <what this entry does not prove>
- **Next action:** <repeat, ask a question, create/update an opportunity, or close>
```

## How to collect the first local evidence

1. Run a short playtest: let a person complete the first opening without hints, then ask what they wanted to do next and where they stopped.
2. Save only an aggregated local event snapshot after the [[20 - Product - Metric Tree|event plan]] has been implemented and explained to the user.
3. Separate a bug from a product problem: an opening error is evidence about quality, but not evidence of the value of an auction or lore.

## Evidence strength

| Level | Example | Permitted use |
|---|---|---|
| Weak | one conversation or one playtest | form a hypothesis and the next question |
| Medium | recurring pattern across several independent sessions | rank a small MVP |
| Strong | recurring events plus a qualitative explanation in a relevant segment | recommend scaling or a decision |

Participant count alone does not make evidence strong: selection method, context, and alternative explanations are required.
