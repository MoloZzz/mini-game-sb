---
tags: [planning, open]
---

# Open Questions

Back to [[00 - Card Game MOC]]

Things deliberately left unresolved. They do not block the start — but should be decided before the relevant milestone.

---

## Blocks M1

### ~~Q1 · What exact hardware?~~ — CLOSED

**RTX 3050 Laptop, 4 GB VRAM · Ryzen 7 4800H · 32 GB RAM · Windows.**

CUDA is available, fp16 is mandatory, and `safety_checker=None` is mandatory. A full batch of 283 cards takes approximately 40–50 minutes with throttling. The target pool of 110 is confirmed without reduction. Details → [[06 - Generation - SD Pipeline]].

One check remains before M1 (5 minutes):
```python
import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))
```
It must be `True NVIDIA GeForce RTX 3050 Laptop GPU`. If `False` — a CPU build of torch was installed; reinstall from the CUDA index at pytorch.org.

### Q2 · Which model is final?
Download `dreamshaper-8`, generate 6 cards with one recipe, and look at them. If it is not good enough — `absolute-reality-1.81`. Do not spend more than an evening comparing models: the difference between them is smaller than the difference from prompt tuning.

---

## Blocks M5

### Q3 · Who writes card names and flavor?
Three options:

| Option | Pros | Cons |
|---|---|---|
| Manually during review | full control, better result | 110 times 30s ≈ an hour |
| Local LLM | fast, free | another model on disk |
| List of templates + suffixes | instant | will feel generated |

**I lean toward a hybrid:** a template as the default in the review form, edited only when it is not good enough. This turns approval into one click in 70% of cases.

### Q4 · Are ATK/DEF calculated or assigned?
Right now they are pure flavor — there is no combat. Proposal: calculate them automatically from the rarity range ([[05 - Game Design - Rarity & Drop Rates]]) with a small random component, editable manually if desired. If combat ever appears, everything will need rebalancing anyway.

---

## Blocks M6

### Q5 · Upscale or not? — PARTIALLY CLOSED
Real-ESRGAN ×2 → 1024px. Pros: art looks better on the reveal screen and on retina. Cons: another model, +time, +storage size.

**Hardware limitation (4 GB VRAM):** SD and Real-ESRGAN cannot stay in memory at the same time. Therefore upscaling physically cannot be part of the generation cycle — only a separate pass:

```python
del pipe; torch.cuda.empty_cache()   # unload SD first
# then load ESRGAN
```

The better alternative here: **run ESRGAN on CPU.** With 32 GB RAM and an 8-core 4800H, this is ~5–10 seconds per image — a one-time pass of ~15 minutes for 110 approved cards, with no VRAM juggling.

**Decision:** skip it in M6 and make it a separate CPU pass over approved cards after the full pool. Nothing is blocked.

### ~~Q6 · How many cards are there really?~~ — CLOSED
**110, as planned.** The CUDA option from Q1 removes the limitation that made this number debatable — a batch of 283 takes ~45 minutes, not a night.

For reference, the minimum at which the game still works: 3 cards per rarity = 18. Below that, the roulette will visibly repeat the same tiles.

---

## Blocks nothing, but interesting

### Q7 · Provably fair
The scheme is described in [[05 - Game Design - Rarity & Drop Rates]]. No practical need (the player is you), but it is the most interesting technical detail of the genre and can be implemented in an hour. Do it in M7 “because we want to.”

### Q8 · Crafting / merging duplicates — PLANNED FOR PHASE 2
A tempting feature: 5 identical common → 1 random uncommon.
**Problem:** it completely breaks the economy from [[04 - Game Design - Core Loop]] — a second path to obtaining cards appears, and all EV calculations must be redone. Do not do it until the main loop feels good.

**Hard constraint from phase 1 ([[12 - Game Design - Economy Rebalance]]):** milestone awarding assumes that the unique-card counter is **monotonic** (`MilestoneService.countUniqueCards` counts `player_cards` with `sold_at IS NULL`, and `LAST_COPY` prevents selling the last copy — so the counter never decreases today). Crafting consumes copies, so **crafting must refuse to consume the last copy of a card**, exactly as selling currently refuses. Build this in from the first crafting commit rather than adding it later.

### Q9 · Themed sets — PLANNED FOR PHASE 2
Instead of one pool — sets of 20 cards (“Ashen Wastes”, “Drowned Court”), each with its own case and prompt style. This gives the collection structure and a reason for new batches. It requires a `set_id` column in `cards` — **add it immediately in M2, even if you do not use it.** Cheaper than a migration later.

### ~~Q10 · Multi-user~~ — CLOSED

Implemented: JWT + local password, with a guard on every route by default. Details and trade-offs → [[10 - Planning - Decisions]] ADR-014.

### Q11 · Animated cards
AnimateDiff on top of SD 1.5 → short looping GIFs for legendary/mythic. It would look great. The cost: another model, generation 10–20 times longer, storage ×30, and video in the roulette strip — definitely no longer 60fps.

**Verdict after the hardware clarification: it will not work.** AnimateDiff keeps a motion module over UNet in memory and computes 16 latent frames at once — at least 6–8 GB VRAM. It will not fit in 4 GB even with aggressive offloading, and on CPU one clip would take tens of minutes.

A realistic replacement for the same effect, if desired: **CSS animation over static art** — slow parallax, moving gradient highlight, particle layer. For two mythic cards on the reveal screen, this gives 80% of the impression for an hour of work and zero VRAM.

---

## Deliberately closed questions

To avoid returning to them:

- **Combat / PvP** — a separate game, twice the size of this one
- **Real money** — not this project
- **Mobile app** — the web version works on a phone
- **Multiplayer, player trading** — there are no other players
- **Cluster, k8s, CI/CD** — this is a laptop
- **Queues / brokers** — the batch is a long CLI process, not a reason to bring in RabbitMQ
