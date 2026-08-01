---
tags: [product, monetization, policy, agent-context]
status: active
---

# Monetization policy

Back to [[00 - Card Game MOC]] · Strategy → [[18 - Product - Strategy]] · Guardrails → [[13 - Product - Context & Guardrails]] · Economy → [[15 - Product - Economy Context]]

## Current decision

**Decision:** real money, payments, and paid random drops are out of scope for this local product. Current `coins` and `keys` are only in-game resources; do not call spending them monetization.

## What can be evaluated now

Agents may propose features for which a player voluntarily spends **time, attention, or in-game currency**, if they support a [[19 - Product - Jobs To Be Done|job]] and do not break the [[15 - Product - Economy Context|economy]]. Preference is not evidence that players would pay real money for the feature.

## If the scope ever changes

No paid mechanic moves from idea to implementation without a separate product-owner decision. Before that, the following are required:

1. An updated product goal, audience, and validated evidence of value in [[21 - Product - Evidence Log]].
2. An explicit model of what is purchased, what value remains free, and how to avoid pay-to-win or exploitation of randomness.
3. A review of legal, age, platform, payment, and privacy requirements for the specific market — they are **not researched here**.
4. Recalculation of sources/sinks and economic protections, including last copy and ledger.
5. An updated solution brief, ADR, and explicit user decision before any payment integration.

Until that decision, the agent must mark any paid proposal as **out of scope**, not as a backlog feature.
