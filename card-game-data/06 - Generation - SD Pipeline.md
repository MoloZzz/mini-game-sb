---
tags: [generation, stable-diffusion]
---

# Пайплайн генерації

Назад до [[00 - Card Game MOC]] · Промпти → [[07 - Generation - Prompt Recipes]]

## Головне рішення: SD малює тільки арт, не картку

**Не намагайся згенерувати готову картку з рамкою, іменем і статистиками.**
SD 1.5 фізично не вміє малювати читабельний текст — це не питання промпту,
це обмеження архітектури (CLIP-енкодер не має посимвольного розуміння).
Спроби дадуть карлючки, схожі на літери.

Замість цього:

```
┌─────────────────────┐
│  ЕМБЕР ДРЕЙК   ⚔12  │  ← DOM / CSS
│ ┌─────────────────┐ │
│ │                 │ │
│ │   квадратний    │ │  ← єдине, що робить SD
│ │   арт 512×512   │ │     (потім апскейл)
│ │                 │ │
│ └─────────────────┘ │
│ "Its breath..."  🛡7│  ← DOM / CSS
└─────────────────────┘
   рамка = CSS/SVG, колір за рідкістю
```

Так само роблять Hearthstone і MTG: арт — це вікно всередині рамки.
Переваги: текст ідеальний, рамка змінюється без перегенерації, локалізація
безкоштовна, і рідкість можна перепризначити не чіпаючи файл.

## Модель: не бери базову SD 1.5

Базова `runwayml/stable-diffusion-v1-5` для fantasy-арту посередня —
каша в деталях, погана анатомія, тьмяні кольори. Файнтюни тієї ж
архітектури (той самий код, той самий VRAM, ті самі 4GB) дають
драматично кращий результат.

| Модель | Коли брати |
|---|---|
| `Lykon/dreamshaper-8` | **дефолт.** Універсальна, добра для fantasy-креатур |
| `Lykon/absolute-reality-1.81` | якщо хочеш реалістичніший темний фентезі |
| `runwayml/stable-diffusion-v1-5` | база, лише для порівняння |

Усе це SD 1.5 під капотом — код `diffusers` не змінюється, тільки рядок
`model_id`. Спробуй два-три і залиш той, що подобається.

## Роздільність: 512×512, крапка

SD 1.5 навчена на 512×512. Генерація напряму в 768 чи 1024 дає
**подвоєні голови, зайві кінцівки, дубльовані тулуби** — це не баг промпту,
це вихід за межі тренувального розподілу.

Пайплайн:
```
SD 1.5 → 512×512 → (опційно) Real-ESRGAN ×2 → 1024×1024 → WebP
                                                    └→ thumb 256×256 WebP
```

Апскейл робити окремим кроком і опційно — на CPU він теж не безкоштовний.
Для першої ітерації 512 цілком достатньо: у картці арт займає ~280px.

Квадрат, а не портрет — бо квадрат найближчий до тренувального розподілу,
а вікно арту в картці все одно квадратне.

## Апаратне забезпечення

Скрипт має сам обирати пристрій:

```python
if torch.cuda.is_available():
    device, dtype = "cuda", torch.float16
elif torch.backends.mps.is_available():
    device, dtype = "mps", torch.float32   # fp16 на MPS часто дає чорні кадри
else:
    device, dtype = "cpu", torch.float32
```

| Пристрій | ~сек/картинка (28 steps) | 110 карток (×2.5 на брак) |
|---|---|---|
| RTX 3060+ | 2–4 с | ~20 хв |
| Apple M-series | 10–20 с | ~1.5 год |
| CPU | 40–90 с | ~7 год, на ніч |

Оптимізації, якщо тісно з пам'яттю:
`pipe.enable_attention_slicing()`, `pipe.enable_vae_slicing()`,
`safety_checker=None` (економить VRAM і не потрібен для драконів).

**Модель качається один раз** (~4 GB) у `~/.cache/huggingface`.
Тримай `HF_HOME` в env, щоб не загубити кеш.

## Batch-скрипт

Мінімальний робочий скелет:

```python
# card-forge/forge.py
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
import torch, json, hashlib, pathlib

pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID, torch_dtype=dtype, safety_checker=None
).to(device)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_attention_slicing()

manifest = []
for recipe in load_recipes("recipes.yaml"):
    for i in range(recipe.count):
        seed = recipe.base_seed + i
        gen = torch.Generator(device).manual_seed(seed)
        image = pipe(
            prompt=recipe.prompt,
            negative_prompt=NEGATIVE,
            num_inference_steps=28,
            guidance_scale=7.0,
            generator=gen,
        ).images[0]

        slug = f"{recipe.id}-{seed:x}"[:48]
        image.save(f"../storage/cards/{slug}.png")
        image.resize((256, 256)).save(f"../storage/thumbs/{slug}.webp")
        manifest.append({ "slug": slug, "imagePath": f"cards/{slug}.png",
                          "thumbPath": f"thumbs/{slug}.webp",
                          "suggestedRarity": recipe.rarity,
                          "archetype": recipe.archetype, "element": recipe.element,
                          "genMeta": { "seed": seed, "prompt": recipe.prompt,
                                       "steps": 28, "cfg_scale": 7.0,
                                       "model": MODEL_ID, "recipe_id": recipe.id }})

json.dump(manifest, open("manifest.json", "w"), indent=2)
```

**`DPMSolverMultistep` замість дефолтного PNDM** — та сама якість за 20–28
кроків замість 50. Вдвічі швидше без втрат. Це найдешевша оптимізація тут.

**Сід зберігається завжди.** Знайшов вдалу картку — можеш відтворити її
точно або варіювати навколо (`seed ± 1..5` дає схожі, але інші результати).

Далі: `python forge.py ingest` читає `manifest.json` і POST'ить на
`/admin/cards/ingest` ([[03 - Architecture - API Contracts]]).

## Крок review — не пропускай

SD 1.5 дає **приблизно 40–60% придатних результатів**. Решта — зламана
анатомія, каша, або просто нудно. Тому:

1. Генеруй **×2.5 від потрібної кількості**. Треба 110 → генеруй ~280.
2. Усе падає в базу як `status: draft`
3. Admin-сітка: дивишся контактшитом, тиснеш approve/reject
4. На approve — даєш ім'я, рідкість, ATK/DEF, флейвор
5. Тільки `approved` бере участь у дропах

Це найбільш недооцінений крок. Люди планують генерацію і забувають, що
хтось має відсіяти брак. Закладай на це реальний час — це буде найдовша
частина M1.

**Ідея для прискорення:** генеруй імена й флейвор окремою LLM за промптом
рецепту, підставляй як дефолт у формі review. Тоді approve — це один клік,
а не заповнення п'яти полів.

## Черговість генерації

Не генеруй усі 110 одразу. Порядок:

1. **6 карток одним рецептом, різні сіди** — перевірити, що пайплайн живий
2. **~20 карток, 4 рецепти** — цього досить для розробки рулетки (M3)
3. Тюнінг промптів на основі того, що вийшло
4. Повний batch на 280 → review → 110

Крок 2 важливий: 20 карток розблоковують всю решту роботи. Не сиди
7 годин над CPU-батчем, поки в тебе ще нема ні API, ні UI.
