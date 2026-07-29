# Product intelligence loop

Use this pack after mandatory product retrieval. It turns a feature, retention, engagement, or future-monetisation request into a falsifiable product decision—not unsupported canon.

## Required flow

1. **Retrieve.** Run `npm run brain:product -- "<request>"`; read every `Read now` note. Start with `card-game-data/13 - Product - Context & Guardrails.md` and use `card-game-data/17 - Product - Solution Brief Template.md`.
2. **Classify.** Label each input: **fact** (code or directly observed), **decision** (owner-approved constraint), **evidence** (dated research, playtest, feedback, or measurement with source), **assumption** (unknown but needed), or **proposal** (new option). No label may silently become fact or decision.
3. **Frame and score opportunities.** State the player/job, desired observable behaviour, target metric, core-loop link, and economy/narrative risk. Compare at least two viable options. Score comparable options with reach × impact × confidence / effort (1–5); give the confidence basis and never invent reach, baselines, or surveys.
4. **Specify the smallest learning experiment.** Complete the solution brief: scope, player flow, guardrails, measurement, success/failure threshold, and owner decision needed. This local product may use a scripted playtest or usability session; never claim causal lift without representative measurement.
5. **Write back deliberately.** Add raw, dated observations to `card-game-data/21 - Product - Evidence Log.md`; move considered items and score/status to `card-game-data/22 - Product - Opportunity Backlog.md`. Update strategy, JTBD, or metric definitions only after an owner decision. Record durable trade-offs in `card-game-data/10 - Planning - Decisions.md`; update system/narrative status only after approval. A proposal stays a proposal in the handoff and vault.

## Metric discipline

- **Retention:** a player returns after a defined interval; state cohort, interval, and return event (for example D1 return and case open). A daily-bonus claim is not retention evidence.
- **Engagement:** depth or quality of an active session—such as meaningful collection choice, case opens, or set progress. It is not automatically retention.
- **Revenue / willingness to pay:** real money is out of scope. Discuss only future research hypotheses or soft-currency value; do not add prices, paid offers, pay-to-win advantages, purchase flow, or revenue targets. A real-money proposal needs an explicit scope decision, separate policy/ethical review, and experiment before implementation.

## Canonical product memory

Retrieve the smallest relevant bundle from the product index, then use these intended sources of truth:

- `card-game-data/18 - Product - Strategy.md` — audience, promise, outcomes, and non-goals.
- `card-game-data/19 - Product - Jobs To Be Done.md` — player jobs and desired outcomes.
- `card-game-data/20 - Product - Metric Tree.md` — metric definitions and measurement boundaries.
- `card-game-data/21 - Product - Evidence Log.md` — raw, dated evidence and limitations.
- `card-game-data/22 - Product - Opportunity Backlog.md` — hypotheses, scores, experiments, and status.
- `card-game-data/23 - Product - Monetization Policy.md` — current scope and conditions for future paid mechanics.
- `card-game-data/13 - Product - Context & Guardrails.md` — current prohibition and conditions for a scope change.

Keep retrieval output, brief, and handoff concise: cite sources and decisions rather than copying them. For any implementation that follows approval, return to the normal impact, invariant, and test workflow.
