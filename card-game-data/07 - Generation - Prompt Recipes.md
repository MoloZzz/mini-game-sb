---
tags: [generation, prompts]
---

# Prompt Recipes

Back to [[00 - Card Game MOC]] · Pipeline → [[06 - Generation - SD Pipeline]]

## Prompt Anatomy

```
[STYLE] + [SUBJECT] + [ELEMENT] + [RARITY-MODIFIER] + [QUALITY]
```

Four layers combine: 5 archetypes × 6 elements × 6 rarities already give
180 unique recipes. More than needed.

## Base Blocks

**STYLE (immutable, defines the identity of the entire set):**
```
fantasy trading card game art, centered character portrait,
painterly digital illustration, dramatic rim lighting, dark background
```

One STYLE for the entire set is what makes 110 different images look like
one collection rather than a random folder. Do not change it between recipes.

**NEGATIVE (the same everywhere):**
```
text, letters, words, watermark, signature, logo, frame, border, ui,
blurry, low quality, jpeg artifacts, deformed, disfigured, bad anatomy,
extra limbs, extra fingers, mutated hands, cropped, out of frame,
multiple heads, duplicate, photo, 3d render
```

`text, letters, words, frame, border` are not accidental here — SD likes
to draw pseudo-text and frames. CSS makes the frame, not the model.

**QUALITY (the tail):**
```
highly detailed, sharp focus, artstation trending, 8k
```

## Archetypes

| ID | Prompt fragment |
|---|---|
| `beast` | `a fearsome fantasy beast creature, scales and fur, wild eyes` |
| `humanoid` | `a fantasy warrior character, ornate armor, determined expression` |
| `undead` | `an undead revenant, hollow glowing eyes, tattered shroud, bone` |
| `construct` | `an animated stone and metal construct, glowing runic core` |
| `spirit` | `an ethereal spirit entity, translucent flowing form, wisps` |

## Elements

| ID | Fragment | Palette |
|---|---|---|
| `fire` | `wreathed in ember and flame, molten cracks, smoke` | orange/red |
| `water` | `flowing water and ice, deep blue glow, mist` | blue/turquoise |
| `earth` | `stone, moss and crystal growths, earthen tones` | brown/green |
| `air` | `swirling wind and storm clouds, crackling lightning` | white/yellow |
| `shadow` | `shrouded in dark purple void mist, sinister glow` | purple/black |
| `light` | `radiant golden holy light, halo, divine glow` | gold/white |

## Rarity Modifiers

The main idea here: **rarity should be visible from the thumbnail, without a label.**

| Rarity | Fragment | CFG | Steps |
|---|---|---|---|
| Common | `simple, plain, muted colors, humble` | 6.0 | 22 |
| Uncommon | `modest detail, slight magical aura` | 6.5 | 25 |
| Rare | `intricate detail, glowing magical energy` | 7.0 | 28 |
| Epic | `highly ornate, powerful magical aura, energy swirling, majestic` | 7.5 | 30 |
| Legendary | `legendary artifact, radiant golden aura, epic scale, awe-inspiring, god rays` | 8.0 | 35 |
| Mythic | `cosmic mythic entity, reality-bending aura, celestial energy, overwhelming divine presence, galaxy` | 8.5 | 40 |

Lower CFG for common means the model “tries” less, producing something simpler and
more ordinary. That is exactly what is needed: common should look common.

## Example of a Complete Recipe

**`beast_fire_legendary`:**
```
fantasy trading card game art, centered character portrait,
painterly digital illustration, dramatic rim lighting, dark background,
a fearsome fantasy beast creature, scales and fur, wild eyes,
wreathed in ember and flame, molten cracks, smoke,
legendary artifact, radiant golden aura, epic scale, awe-inspiring, god rays,
highly detailed, sharp focus, artstation trending, 8k
```
`cfg_scale: 8.0`, `steps: 35`, `seed: 700000+i`

## Config Format

```yaml
# card-forge/recipes.yaml
style: &style >
  fantasy trading card game art, centered character portrait,
  painterly digital illustration, dramatic rim lighting, dark background
quality: &quality "highly detailed, sharp focus, artstation trending, 8k"
negative: &neg "text, letters, words, watermark, ..."

recipes:
  - id: beast_fire_legendary
    archetype: beast
    element: fire
    rarity: legendary
    count: 12          # ×2.5 defect buffer → ~5 of the 6 needed will remain
    base_seed: 700000
    cfg_scale: 8.0
    steps: 35
```

**`count` is always ×2.5 the target rarity pool**
([[05 - Game Design - Rarity & Drop Rates]]), because fewer than half will pass approval.

## Pool Coverage Plan

Target 110 cards → generate ~280.

| Rarity | Target | Recipes | count each | Total generated |
|---|---|---|---|---|
| Common | 40 | 10 | 10 | 100 |
| Uncommon | 30 | 8 | 9 | 72 |
| Rare | 20 | 6 | 8 | 48 |
| Epic | 12 | 5 | 7 | 35 |
| Legendary | 6 | 3 | 6 | 18 |
| Mythic | 2 | 2 | 5 | 10 |
| | **110** | **34** | | **283** |

34 recipes from archetype×element combinations — choose a subset, not all 180.

## Practical Notes

**Neighboring seeds produce similar results.** Found a good card with seed 428193?
Try 428190–428198 — you will get variations of the same composition. Useful when
the recipe almost worked.

**Token order matters.** What comes at the beginning of the prompt has more influence.
That is why STYLE comes first; it should dominate the entire set.

**CLIP truncates at 77 tokens.** The prompts above fit (~60–70).
If you add more, something will have to be removed, or the tail will simply
be silently ignored.

**Prompt weights** (`(word:1.3)`) work in AUTOMATIC1111, but require `compel` in plain
`diffusers`. Do not bring it in for the first iteration; reordering words gives 80%
of the same effect.

**Keep a log.** A separate note with “recipe → result” pairs. After
20 batches you will not remember why `shadow_undead_epic` looked good while
`shadow_spirit_epic` did not. This is the most valuable artifact of the entire process.
