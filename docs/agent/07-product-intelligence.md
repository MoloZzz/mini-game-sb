# Product intelligence loop

Use this pack after the mandatory product retrieval. Its purpose is to turn a request for a feature, retention, engagement, or future monetisation into a falsifiable product decision—not unsupported product canon.

## Required flow

1. **Retrieve.** Run `npm run brain:retrieve -- "<request>"`; read every `Read now` note. Begin from `card-game-data/13 - Product - Context & Guardrails.md` and use `card-game-data/17 - Product - Solution Brief Template.md`.
2. **Classify.** Label each input: **fact** (code or directly observed), **decision** (owner-approved constraint), **evidence** (dated research, playtest, feedback, or measurement with source), **assumption** (unknown but needed), or **proposal** (new option). Evidence is not a decision; no label may be silently promoted to fact.
3. **Frame and score opportunities.** Name the player/job, desired observable behaviour, target metric, core-loop link, and economy/narrative risk. Compare at least two viable options. Score only comparable options with reach × impact × confidence / effort (1–5); show the confidence basis and do not invent reach, baselines, or survey results.
4. **Specify a smallest learning experiment.** Complete the solution brief: scope, player flow, guardrails, measurement method, success/failure threshold, and owner decision needed. In this local product, an experiment may be a scripted playtest or usability session; never claim causal lift without representative measurement.
5. **Write back deliberately.** Add raw, dated observations to `card-game-data/21 - Product - Evidence Log.md`; move a considered item and its score/status to `card-game-data/22 - Product - Opportunity Backlog.md`. Update strategy, jobs, or metric definitions only when the owner decides them. Record durable trade-offs in `card-game-data/10 - Planning - Decisions.md`; update system/narrative status only after approval. A proposal remains a proposal in the handoff and vault.

## Metric discipline

- **Retention:** a player returns after a defined interval; state cohort, interval, and return event (for example, D1 return and case open). Do not substitute a daily bonus claim for retention evidence.
- **Engagement:** depth or quality of an active session—such as meaningful collection choice, case opens, or set progress. It is not automatically retention.
- **Revenue / willingness to pay:** while real money is out of scope, discuss only future research hypotheses or soft-currency value. Do not add prices, paid offers, pay-to-win advantages, purchase flow, or revenue targets. A real-money proposal requires an explicit scope decision, its own policy/ethical review, and a separate experiment before implementation.

## Canonical product memory

Retrieve the smallest relevant bundle from the product index, then use these intended sources of truth:

- `card-game-data/18 - Product - Strategy.md` — audience, promise, outcomes, and non-goals.
- `card-game-data/19 - Product - Jobs To Be Done.md` — player motivations and desired progress.
- `card-game-data/20 - Product - Metric Tree.md` — definitions and measurement boundaries.
- `card-game-data/21 - Product - Evidence Log.md` — raw, dated evidence and its limitations.
- `card-game-data/22 - Product - Opportunity Backlog.md` — hypotheses, scores, experiments, and status.
- `card-game-data/23 - Product - Monetization Policy.md` — current prohibition and conditions for any future scope change.

Keep retrieval output, brief, and handoff concise: cite sources and decisions rather than copying them. For any implementation that follows approval, return to the normal impact, invariant, and test workflow.
