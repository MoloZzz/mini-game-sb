---
tags: [product, lore, narrative, agent-context]
status: discovery
---

# Narrative Bible: Established Canon and Gaps

Back to [[00 - Card Game MOC]] · Systems → [[14 - Product - System Landscape]] · Decision format → [[17 - Product - Solution Brief Template]]

## Status

**Important:** there is not yet a complete lore canon. This document does not permit invention to be treated as fact; it separates existing foundations from places where the product owner must choose a direction.

## Established foundations

| Level | Canonical fact | Source |
|---|---|---|
| Genre | Fantasy card-collection game | [[00 - Card Game MOC]] |
| Collection subject | cards have art, name, flavor, rarity, element, and archetype | `packages/shared-types/src/card.ts` |
| Tone | magical chests, relics, elements, creatures, and dark fantasy art | case names, recipe/prompt system |
| Future structure | themed sets may be possible, including “Ashen Wastes” and “Drowned Court” | [[11 - Planning - Open Questions]] Q9 |
| Narrative presentation | a card may carry flavor; mechanical ATK/DEF do not currently determine story or combat | [[11 - Planning - Open Questions]] Q3–Q4 |

## Deliberately not established

There is no approved protagonist, world map, factions, chronology, central conflict, world name, or reason for the cases to exist. An agent must not present such details as “already present in the game.”

## How to propose lore without hallucinations

1. Start from an existing foundation: set, element, archetype, or case name.
2. Mark new material as **Option A/B/C**, not canon.
3. Give a short product consequence: how this lore makes the next set, case, or collection goal clearer.
4. Ask for approval of one direction before generating dozens of names, flavors, or quests.
5. After approval, move the choice to the “Approved canon” section below and add an ADR if it affects multiple systems.

## Approved canon

Currently empty. Add only user decisions here, not agent proposals.

## Decision map for the first lore pass

| Question | Example of a controlled choice |
|---|---|
| What unites the sets? | one world / independent legends / relic archive |
| Who opens the cases? | collector / archivist / unnamed player |
| What is the tone? | heroic / grim / fairytale dark fantasy |
| What makes the set special? | location / faction / catastrophe / elemental conflict |

Do not choose for the user: show 2–3 options and their impact on art, names, and subsequent sets.
