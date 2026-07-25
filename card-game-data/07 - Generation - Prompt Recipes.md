---
tags: [generation, prompts]
---

# Рецепти промптів

Назад до [[00 - Card Game MOC]] · Пайплайн → [[06 - Generation - SD Pipeline]]

## Анатомія промпту

```
[СТИЛЬ] + [СУБ'ЄКТ] + [СТИХІЯ] + [РІДКІСТЬ-МОДИФІКАТОР] + [ЯКІСТЬ]
```

Чотири шари комбінуються: 5 архетипів × 6 стихій × 6 рідкостей вже дають
180 унікальних рецептів. Більше, ніж потрібно.

## Базові блоки

**STYLE (незмінний, задає впізнаваність усього сету):**
```
fantasy trading card game art, centered character portrait,
painterly digital illustration, dramatic rim lighting, dark background
```

Один STYLE на весь сет — це те, що робить 110 різних картинок схожими на
одну колекцію, а не на випадкову папку. Не міняй його між рецептами.

**NEGATIVE (однаковий скрізь):**
```
text, letters, words, watermark, signature, logo, frame, border, ui,
blurry, low quality, jpeg artifacts, deformed, disfigured, bad anatomy,
extra limbs, extra fingers, mutated hands, cropped, out of frame,
multiple heads, duplicate, photo, 3d render
```

`text, letters, words, frame, border` тут не випадково — SD любить
домальовувати псевдо-текст і рамки. Рамку робить CSS, не модель.

**QUALITY (хвіст):**
```
highly detailed, sharp focus, artstation trending, 8k
```

## Архетипи

| ID | Промпт-фрагмент |
|---|---|
| `beast` | `a fearsome fantasy beast creature, scales and fur, wild eyes` |
| `humanoid` | `a fantasy warrior character, ornate armor, determined expression` |
| `undead` | `an undead revenant, hollow glowing eyes, tattered shroud, bone` |
| `construct` | `an animated stone and metal construct, glowing runic core` |
| `spirit` | `an ethereal spirit entity, translucent flowing form, wisps` |

## Стихії

| ID | Фрагмент | Палітра |
|---|---|---|
| `fire` | `wreathed in ember and flame, molten cracks, smoke` | помаранч/червоний |
| `water` | `flowing water and ice, deep blue glow, mist` | синій/бірюза |
| `earth` | `stone, moss and crystal growths, earthen tones` | коричневий/зелений |
| `air` | `swirling wind and storm clouds, crackling lightning` | білий/жовтий |
| `shadow` | `shrouded in dark purple void mist, sinister glow` | фіолетовий/чорний |
| `light` | `radiant golden holy light, halo, divine glow` | золотий/білий |

## Модифікатори рідкості

Тут головна ідея: **рідкість має бути видно з мініатюри, без підпису.**

| Рідкість | Фрагмент | CFG | Steps |
|---|---|---|---|
| Common | `simple, plain, muted colors, humble` | 6.0 | 22 |
| Uncommon | `modest detail, slight magical aura` | 6.5 | 25 |
| Rare | `intricate detail, glowing magical energy` | 7.0 | 28 |
| Epic | `highly ornate, powerful magical aura, energy swirling, majestic` | 7.5 | 30 |
| Legendary | `legendary artifact, radiant golden aura, epic scale, awe-inspiring, god rays` | 8.0 | 35 |
| Mythic | `cosmic mythic entity, reality-bending aura, celestial energy, overwhelming divine presence, galaxy` | 8.5 | 40 |

Нижчий CFG для common — модель менше «старається», виходить простіше й
буденніше. Це саме те, що треба: common має виглядати як common.

## Приклад зібраного рецепту

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

## Формат конфігу

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
    count: 12          # ×2.5 запас на брак → лишиться ~5 з 6 потрібних
    base_seed: 700000
    cfg_scale: 8.0
    steps: 35
```

**`count` завжди ×2.5 від цільового пулу рідкості**
([[05 - Game Design - Rarity & Drop Rates]]), бо approve пройде менше половини.

## План покриття пулу

Ціль 110 карток → генерувати ~280.

| Рідкість | Ціль | Рецептів | count кожен | Разом генерується |
|---|---|---|---|---|
| Common | 40 | 10 | 10 | 100 |
| Uncommon | 30 | 8 | 9 | 72 |
| Rare | 20 | 6 | 8 | 48 |
| Epic | 12 | 5 | 7 | 35 |
| Legendary | 6 | 3 | 6 | 18 |
| Mythic | 2 | 2 | 5 | 10 |
| | **110** | **34** | | **283** |

34 рецепти з комбінацій архетип×стихія — обираєш підмножину, не всі 180.

## Практичні нотатки

**Сіди сусідні дають схожі результати.** Знайшов вдалу картку з seed 428193?
Спробуй 428190–428198 — отримаєш варіації тієї ж композиції. Корисно, коли
рецепт майже спрацював.

**Порядок токенів має вагу.** Те, що на початку промпту, впливає сильніше.
Тому STYLE іде першим — він і має домінувати над усім сетом.

**CLIP обрізає на 77 токенах.** Наведені промпти вкладаються (~60–70).
Якщо додаватимеш — щось доведеться прибрати, інакше хвіст просто
проігнорується мовчки.

**Ваги промпту** (`(word:1.3)`) працюють у AUTOMATIC1111, але в чистому
`diffusers` вимагають `compel`. Не тягни його заради першої ітерації —
перестановка слів дає 80% того ж ефекту.

**Веди журнал.** Окрема нотатка з парами «рецепт → що вийшло». Через
20 батчів ти не згадаєш, чому `shadow_undead_epic` виглядав добре, а
`shadow_spirit_epic` — ні. Це найцінніший артефакт усього процесу.
