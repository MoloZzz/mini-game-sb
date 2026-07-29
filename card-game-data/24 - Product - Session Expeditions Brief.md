---
tags: [product, solution-brief, tasks, agent-context]
status: ready-for-test
---

# Solution brief · Session Expeditions MVP

Back to [[00 - Card Game MOC]] · Strategy → [[18 - Product - Strategy]] · Opportunity → [[22 - Product - Opportunity Backlog#O-002 · Session expeditions]]

## 1. Context retrieval

- **Request:** give a player a meaningful choice for the current session without
  mixing tasks, collections and achievements.
- **Facts:** the core loop is `case → reveal → collection`; collections count
  distinct unsold cards; coins/keys mutations require ledger rows; real money,
  PvP and live-service are out of scope.
- **Decision:** collections, achievements and tasks are separate systems.
- **Evidence:** none. The collector and “clear next action” are hypotheses.
- **Open assumption:** a voluntary session objective is clearer and less
  pressuring than a generic milestone or a calendar-bound daily task.

## 2. Player outcome

**Working segment / job:** collector with a few minutes wants to know what is
worth doing now, then return to the existing case/reveal/collection loop.

**Observable behavior:** after seeing two expedition choices, the player can
say which one they chose and open its linked case; after reveal, they inspect
the related collection progress.

## 3. Options considered

| Option | Flow | Economy / product risk | Score |
|---|---|---|---|
| Daily quest with coin/key reward | receive task → perform action → claim reward | creates obligation and a new currency source | 3 × 4 × 2 / 3 = 8 |
| Passive “next goal” copy | show one suggested action → link to case | no agency; remains easy to confuse with collection goal | 3 × 3 × 2 / 2 = 9 |
| **Two session expeditions** | choose a direction → existing case → reveal → collection | no reward or timer; tests choice, not economy | 4 × 5 × 2 / 4 = **10** |

Confidence is weak for every option: the score only prioritizes a learning
test; it is not a demand estimate.

## 4. Recommended MVP

### Scope and player flow

On the lobby, show one optional **Expeditions** panel with exactly two cards:

1. **Follow the Cinders** → `Cinderbound Cache` → Ashen Wastes collection.
2. **Widen the Archive** → chooser of the existing non-set cases → global
   collection.

Selection highlights the chosen direction and deep-links into the existing
case opening screen. A successful reveal shows “Expedition complete” only for
that browser session and points to the relevant collection. Skipping the panel
has no penalty and all current case entry points remain available.

### State and economy rules

- Client-only ephemeral selection for the test; no new table, API route,
  currency, card, cooldown, streak or claim action.
- No coins/keys/cards are created or consumed by an expedition itself; the
  linked case remains the only balance mutation and keeps its ledger rules.
- The server remains authoritative for the actual case result. The expedition
  never changes rarity weights, drop pool, pity, prices or last-copy rules.
- The task is completed by one successful linked reveal; abandoned selections
  silently expire on refresh or new session.

### Scope exclusions

No daily/weekly reset, notification, timer, calendar, streak, reward chest,
new currency, paid acceleration, leaderboard, or narrative canon. This is a
choice test, not a task economy.

## 5. Learning plan and decision rule

**Exposure:** scripted local usability sessions after the Ashen Wastes flow is
available. Show the lobby panel without explaining its intended answer.

**Primary signal:** the participant completes `case_opened → reveal_completed
→ collection_viewed` after selecting an expedition.

**Guardrails:** new unique cards per opening, net coins/keys per session, and
the participant's explicit report of pressure or confusion. No baseline exists
yet; do not calculate retention lift.

**Prompts:** “What would you do next, and why?”, “What did you think this
choice would change?”, “Did anything feel obligatory or misleading?”

**Scale:** only if the same voluntary-choice explanation appears in at least
two independent playtests and no participant reports that the panel is a
mandatory daily obligation. **Revise** if players confuse it with a set or
milestone. **Stop** if it does not alter the next action or adds pressure.

After each session, record raw observations in [[21 - Product - Evidence Log]];
do not promote the hypothesis to a retention fact.
