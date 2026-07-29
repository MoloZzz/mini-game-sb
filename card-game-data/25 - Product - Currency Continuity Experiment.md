---
tags: [product, economy, experiment]
status: discovery
---

# Currency continuity experiment

Назад до [[00 - Card Game MOC]] · Evidence → [[21 - Product - Evidence Log]] · Opportunity → [[22 - Product - Opportunity Backlog]]

## What we know

- **Fact:** the current seeded model reaches a no-affordable-case state in
  almost all simulated paths; details → [[21 - Product - Evidence Log#E-2026-07-29-02]].
- **Decision:** no real money, FOMO, timer, streak, paid bypass or hidden RNG
  recovery. Ledger, server authority and last-copy protection remain intact.
- **Open:** a model cannot say whether a player wants more opens, wants a
  collection activity instead, or is happy to end a session.

## Player/job hypothesis

When a collector has insufficient currency for every case, they want to know
what is genuinely possible now and how to reach a meaningful next attempt,
without a calendar obligation or a deceptive promise.

Primary test: the player can explain the zero state, name one available next
action, and say whether it feels voluntary. This is **not** a retention test.

## Candidate directions

| Variant | Flow | What it tests | Boundary / risk |
|---|---|---|---|
| Control: transparent zero state | show balance, case requirement, collection route and available actions | whether the present problem is comprehension rather than reward size | does not remove the economic lock |
| Finite onboarding runway | a clearly bounded, non-tradeable opening allowance for the first session | whether a player can learn the collection loop before currency becomes a concern | only shifts the lock; it cannot create indefinite play |
| Condition-based recovery | when no active case is affordable, show one explicit, finite recovery action | whether a non-timed escape from a dead end feels fair and understandable | amount, repeat rule and source/sink are open; must not become a currency faucet |
| Repeatable non-timed source | a new voluntary activity earns another opening | whether long case-opening sessions are the intended product | this is a new core system, not a small balance tweak; no implementation until owner selects it |

The first three remain comparable test concepts. The fourth is a scope choice:
without it, every currency model will eventually end a case-opening session.

## Scripted playtest

1. Start a test account at a zero-affordable-case state after its daily bonus
   is already claimed.
2. Show one variant, without explaining it first.
3. Ask: “What does this state mean? What can you do now? What would you do
   next, and why?”
4. Ask: “Does this feel like a fair end to the session, a confusing error, or
   pressure to return later?”
5. Repeat with another variant and counterbalance order between participants.

Record only: correct comprehension, chosen next action, direct reason,
pressure/confusion response and whether the player voluntarily opens a case
when one becomes possible. Do not count a daily claim as retention.

## Guardrails and decision rule

- **Economy:** net coins/keys per session; new unique cards per opening;
  frequency of balance below the cheapest case; no positive long-run currency
  drift in the seeded model.
- **Experience:** no timer, streak, expiry, nagging modal, hidden eligibility
  condition or lost progress for leaving.
- **Scale:** only if independent participants understand the state and explain
  the recovery as voluntary, while the updated model keeps a finite or
  deliberately bounded source/sink.
- **Revise:** if it is understood but the player says it merely delays the
  same dead end.
- **Stop:** if it creates pressure, confusion, or an unbounded positive
  currency drift.

## Owner decision required

Choose the target product shape before implementation:

1. **Finite opening session:** solve onboarding and explain a natural session
   end; no repeatable currency source.
2. **Long opening session:** authorise discovery of one repeatable,
   non-timed activity that creates a bounded next opening. This expands the
   core loop and needs a separate solution brief and economy model.
