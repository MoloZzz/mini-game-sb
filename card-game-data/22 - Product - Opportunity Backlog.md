---
tags: [product, opportunities, backlog, agent-context]
status: active
---

# Product opportunity backlog

Back to [[00 - Card Game MOC]] · Strategy → [[18 - Product - Strategy]] · Evidence → [[21 - Product - Evidence Log]] · Systems → [[14 - Product - System Landscape]]

## Backlog rule

An entry here is a **decision hypothesis**, not an approved roadmap feature or canon. A system’s implemented or planned status changes only in [[14 - Product - System Landscape]] after a product-owner decision.

Ranking exists to choose the next test, not to create false precision. Do not set `confidence` above weak without a link to [[21 - Product - Evidence Log|evidence]].

## Opportunities

### O-003 · Currency continuity without timed pressure

- **Status:** discovery.
- **Job / segment hypothesis:** [[19 - Product - Jobs To Be Done]] —
  a collector wants a meaningful next chance when there are still few
  duplicates or the balance is below the case price.
- **Problem or opportunity:** owner-reported observation says players can
  reach a balance with no immediate currency source. Current sources are an
  initial grant, daily bonus, duplicate sale and milestones; early duplicate
  resale is structurally weak. Sample and frequency are unknown.
- **Hypothesis:** if a player sees a finite, understandable, non-timed path
  to the next meaningful action, they will be able to explain what to do next
  without feeling calendar pressure.
- **Evidence:** [[21 - Product - Evidence Log#E-2026-07-29-01]] and
  [[21 - Product - Evidence Log#E-2026-07-29-02]]. Seeded model confirms
  a finite-session soft lock under its declared policy; player frequency and
  reason for stopping remain unknown.
- **Success metric / guardrail:** task comprehension in the playtest; `net
  coins/keys per session`, share of balances below the cheapest case price,
  new unique cards per opening, and the response about pressure/confusion.
  Baseline and thresholds are open.
- **Smallest test:** [[26 - Product - Archive Dossiers Brief]]: zero-balance
  scenario with three-card dossier → one bounded Archive Pass. Owner selected
  the long-session direction in ADR-018; the exact mechanism remains a
  proposal until the scripted playtest.
- **System impact:** core loop, economy, UI.
- **Risks and boundaries:** every currency mutation requires a ledger; do not
  introduce a timer, streak, paid bypass, hidden RNG, or infinite source. Do not
  change case price, daily bonus, and duplicate sell value at the same time.
- **Score:** onboarding runway `4 × 4 × 2 / 2 = 16`; condition-based
  recovery `3 × 5 × 2 / 3 = 10`; duplicate protection `3 × 4 × 2 / 3 = 8`.
  Confidence is weak: the sources are external, and there is no local playtest.
- **Next decision:** choose only one MVP after modelling and testing; stop
  if it does not remove the soft lock or creates pressure/positive long-term
  currency drift.

### O-002 · Session expeditions

- **Status:** ready-for-test (owner delegated the MVP boundary on 2026-07-29;
  brief → [[24 - Product - Session Expeditions Brief]]).
- **Job / segment hypothesis:** collector — know what to do in this session without
  a calendar obligation.
- **Problem:** a set explains a long-term chase but not always the next
  meaningful action in a short session.
- **Hypothesis:** one optional session expedition with a visible, finite action
  will create a clearer next step than a generic milestone.
- **Evidence:** none; it is not a retention claim.
- **Metric / guardrail:** `case_opened → reveal_completed → collection_viewed`;
  guardrail new unique cards per opening, net coins/keys per session, and a
  qualitative report of pressure or confusion. Baseline and threshold are open.
- **Smallest test:** scripted playtest, one expedition versus no expedition;
  ask “What would you do next, and why?”
- **Impact:** core loop, economy, UI; no real-money scope.
- **Risks:** a daily/streak version could manufacture obligation or become an
  uncontrolled currency source. MVP excludes streaks, timers and new currency.
- **Score:** session expedition 4 × 5 × 2 / 4 = 10; daily task 3 × 4 × 2 / 3 =
  8. Confidence is weak because no player evidence exists.
- **Next decision:** implement only the smallest non-economic session flow
  after the Ashen Wastes playtest; stop or revise if players cannot explain why
  they chose it or report pressure.

### O-001 · Ashen Wastes set

- **Status:** testing (implemented locally on 2026-07-29; owner delegated the product choice).
- **Job / segment hypothesis:** collector — see an incomplete themed set and
  move toward finishing it.
- **Problem:** the current full-pool gallery shows missing cards but does not
  provide a small, meaningful collection target.
- **Hypothesis:** a visible 0/20 Ashen Wastes goal and its dedicated case will
  give a collector a clearer reason to return to the case loop.
- **Evidence:** none; this remains a hypothesis, not a claim of demand.
- **Metric / guardrail:** primary `case_opened → reveal_completed →
  collection_viewed`; guardrail new unique cards per opening and net
  coins/keys per session. Baseline and thresholds are open.
- **Smallest test:** scripted local playtest: show the set goal after a
  reveal and ask, “What would you do next, and why?”
- **Impact:** core loop, economy, content/lore, UI.
- **Risks:** a targeted case can distort duplicate EV; the implemented 400-coin
  profile has full-duplicate EV 208.45 coins (52.1%); no completion reward.
- **Score:** reach 4 × impact 5 × confidence 2 / effort 4 = 10; confidence
  is weak because there is no recorded player evidence.
- **Next decision:** model case price/odds across new, mid, and
  near-complete collections; scale only if the playtest shows the set makes
  the next action clearer without displacing the core case loop.

The backlog is currently empty: existing directions (sets, crafting, shop,
NPC auction, lore) already have statuses in [[14 - Product - System Landscape]],
but lack sufficient evidence for prioritization.

Add an entry using the template. Keep it short: the detailed flow belongs in the [[17 - Product - Solution Brief Template|solution brief]].

```md
### O-<XXX> · <title>

- **Status:** discovery | ready-for-test | testing | decided | rejected
- **Job / segment hypothesis:** <link to [[19 - Product - Jobs To Be Done]].>
- **Problem or opportunity:** <TBD>
- **Hypothesis:** if <TBD>, then <TBD>, because <TBD>.
- **Evidence:** <[[21 - Product - Evidence Log#E-...]] or `none`>.
- **Success metric / guardrail:** <link to [[20 - Product - Metric Tree]]; threshold — `open` if not approved>.
- **Smallest test:** <TBD>
- **System impact:** <core loop | economy | content/lore | UI; link to [[14 - Product - System Landscape]].>
- **Risks and boundaries:** <last copy, ledger, EV, scope, or canon — what to check>.
- **Score:** impact `low|medium|high`; confidence `weak|medium|strong`; effort `S|M|L`.
- **Next decision:** <what must happen to scale, change, or reject the idea>.
```

## Decision sequence

1. Link the opportunity to one job and a testable problem.
2. Add existing evidence or a separate way to collect it.
3. Select an MVP that does not violate [[13 - Product - Context & Guardrails]] and, when needed, [[15 - Product - Economy Context]].
4. Describe the MVP in a solution brief and implement it only after the user’s decision.
5. Add evidence after testing; record an approved long-term rule in [[10 - Planning - Decisions]], and the system status in [[14 - Product - System Landscape]].

## Do not confuse

- **Idea without evidence** → opportunity with `discovery` status.
- **User decision** → ADR/[[10 - Planning - Decisions]].
- **Planned system** → [[14 - Product - System Landscape]].
- **Unanswered question blocking a choice** → [[11 - Planning - Open Questions]].
