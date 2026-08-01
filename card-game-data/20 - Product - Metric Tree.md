---
tags: [product, metrics, telemetry, agent-context]
status: active
---

# Metric tree and event plan

Back to [[00 - Card Game MOC]] · Strategy → [[18 - Product - Strategy]] · Jobs → [[19 - Product - Jobs To Be Done]] · Evidence → [[21 - Product - Evidence Log]] · Economy → [[15 - Product - Economy Context]]

## Measurement principle

**Fact:** the product is local; remote analytics and metric baselines are not validated. Therefore, no number below is a current result or target.

**Decision for future telemetry:** collect only the minimum events needed for a decision; store them locally, explain their purpose to the player, and do not add personal data to product snapshots. Remote sending or trackers require a separate product-owner decision.

## Metrics

The primary outcome is a **repeat meaningful collection session**: the player returns and voluntarily completes at least part of the core loop. This is a measurement direction, not an established KPI target.

| Branch | Metric | Definition | Status / caveat |
|---|---|---|---|
| Return | D1 / D7 return | share of players with new activity on calendar day 1 / 7 after the first session | Open: requires timestamps, a cohort rule, and sufficient observations |
| Engagement | active days per player | number of distinct days with a meaningful action | Open: “meaningful action” is defined below |
| Engagement | core-loop completion | `case_opened → reveal_completed → collection_viewed` within a session | Open: reveal and collection viewing still need instrumentation |
| Progress | new unique cards per opening | share of openings that add a new unsold card | Check together with pool size; do not interpret as satisfaction |
| Progress | milestone achievement | number/share of sessions with a new milestone | Fact about the system, not about reward desirability |
| Economy | net coins/keys per session | sum of ledger changes for the player and session | Requires a session rule; do not mix with real money |
| Quality | failed case-opening attempts | opening errors or refusals / all attempts | Requires an error event; do not count voluntary cancellation as failure |
| Qualitative value | return reason / friction | short answer after a playtest: “what did you want to do next?” | Do not reduce to a number; source → [[21 - Product - Evidence Log]] |

## Event plan

The events below are a **specification for future implementation**, not a claim that they already exist. `player_id` or a technical local identifier is allowed only inside local storage; do not record email, tokens, password text, or the full card contents.

| Event | When | Minimum properties | Supports |
|---|---|---|---|
| `session_started` | first meaningful action after 30 minutes of inactivity | `session_id`, `occurred_at` | D1/D7, active days |
| `case_opened` | server successfully records an opening | `session_id`, `case_slug`, `currency`, `cost`, `rarity`, `is_new` | core loop, progress, economy |
| `reveal_completed` | UI finishes showing the result | `session_id`, `case_slug` | core-loop completion |
| `collection_viewed` | inventory or collection screen is opened | `session_id`, `filter_used` (boolean) | core-loop completion, goal discovery |
| `duplicate_sold` | server successfully sells duplicates | `session_id`, `count`, `coins_received` | duplicate loop, economy |
| `milestone_awarded` | server awards a milestone | `session_id`, `milestone_id`, `reward_type` | progress |
| `feature_used` | future system completes its primary action | `session_id`, `feature`, `result` | evaluation of shop, NPC auction, sets, or lore |
| `action_failed` | meaningful action ends in an error | `session_id`, `action`, `error_code` | quality; without error text containing personal data |

## Implementation sequence

1. Before the feature, record the primary metric, events, and the decision they support in the solution brief.
2. Define local storage, retention period, and export method. These are **open** technical decisions; do not add the schema silently.
3. Add events with the feature, verify them with a test, and record the first dated snapshot as evidence.
4. Review both quantitative data and playtest feedback; only then update [[22 - Product - Opportunity Backlog]] or the ADR.

## Interpretation rules

- One change does not prove causality: compare with a clear control state or sequential playtests.
- A small local sample is a signal, not a statistical truth; record its size and selection method.
- Retention must not improve through pressure, timers, or hidden economic degradation: check [[13 - Product - Context & Guardrails]] and [[15 - Product - Economy Context]].
