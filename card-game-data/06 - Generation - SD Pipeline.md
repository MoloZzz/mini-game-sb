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

## Апаратне забезпечення — RTX 3050 Laptop, 4 GB VRAM

**Цільове залізо (визначене):**
Ryzen 7 4800H · 32 GB RAM · **RTX 3050 Laptop, 4 GB VRAM** · Radeon iGPU · Windows

Це працює, але 4 GB — нижня межа. Кілька прапорців із «опційних» стають
обов'язковими.

### Бюджет VRAM при 512×512, fp16, batch=1

| Складова | ~Розмір |
|---|---|
| UNet fp16 | 1.7 GB |
| Text encoder (CLIP) | 0.25 GB |
| VAE | 0.16 GB |
| **Ваги разом** | **~2.1 GB** |
| Активації під час дифузії | 0.8–1.4 GB |
| Резерв драйвера / WDDM | 0.2–0.4 GB |
| **Пік** | **~3.1–3.9 GB** |

Вкладається в 4 GB, але без запасу. Тому:

### Обов'язково

```python
pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.float16,   # НЕ float32 — fp32 не влізе в принципі
    variant="fp16",              # качає ~2 GB замість ~4 GB
    safety_checker=None,         # звільняє ~1.2 GB — найбільша окрема економія
    requires_safety_checker=False,
).to("cuda")
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_vae_slicing()        # дешева страховка на кроці декоду
```

`safety_checker=None` тут не «економія», а необхідність — цей чекер тягне
власну CLIP-модель на ~1.2 GB, і на 4 GB це різниця між роботою та OOM.
Для драконів він і так безглуздий.

**`enable_attention_slicing()` — НЕ додавай одразу.** З torch 2.x вбудований
SDPA вже memory-efficient і швидший за ручний slicing. Вмикай slicing тільки
якщо реально впіймав OOM — воно коштує ~20–30% швидкості.

**`enable_model_cpu_offload()` — тільки як останній засіб.** Уповільнює
в 3–5 разів. З 32 GB RAM це реальний фолбек, але при 512×512 він не знадобиться.

### Реальні таймінги на RTX 3050 Laptop

| Профіль | Steps | ~сек/картинка |
|---|---|---|
| Common | 22 | ~4 с |
| Rare | 28 | ~5 с |
| Legendary | 35 | ~6.5 с |
| Mythic | 40 | ~7.5 с |

**Повний batch на 283 картки ≈ 30 хв чистого рахунку.**
З урахуванням тротлінгу ноутбука на тривалому навантаженні — **40–50 хвилин.**
Це один прийом за кавою, а не ніч. Ціль пулу 110 карток лишається без змін,
і можна дозволити ×3 запас на брак замість ×2.5.

### Пастки саме цієї конфігурації

**1. Гібридна графіка.** У ноутбука два GPU. Перевір у Windows
Settings → Display → Graphics, що дисплей і браузер працюють на **Radeon iGPU**,
а Python — на 3050. Якщо дисплей висить на 3050, вона віддає 0.5–1 GB під
робочий стіл, і бюджет вище перестає сходитись.

**2. Chrome/Electron їдять VRAM.** Закрий браузер і Discord перед батчем.
На 4 GB це не забобон — це 300–800 MB.

**3. Torch треба ставити з CUDA-індексу.** Дефолтний `pip install torch`
на Windows може поставити CPU-збірку і потім мовчки рахувати на процесорі.
Візьми актуальну команду з pytorch.org (вигляду
`pip install torch --index-url https://download.pytorch.org/whl/cuXXX`)
і одразу перевір:
```python
import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))
# очікується: True NVIDIA GeForce RTX 3050 Laptop GPU
```

**4. Не залишай pipeline у пам'яті між етапами.** Апскейл робити окремим
проходом після `del pipe; torch.cuda.empty_cache()` — Real-ESRGAN і SD
разом у 4 GB не живуть. Деталі в [[11 - Planning - Open Questions]], Q5.

**5. xformers не потрібен.** На Windows його встановлення — окремий квест
із версіями, а виграш проти вбудованого SDPA у torch 2.x близький до нуля.

**6. Чого точно НЕ вийде на 4 GB:** SDXL, ControlNet поверх SD 1.5 при 512,
генерація 768×768+, тренування LoRA. Жодне з цього в плані не потрібне —
але варто знати межу до того, як захочеться спробувати.

### Портативність скрипта

Автовибір пристрою лишається — щоб код працював, якщо запустиш на іншій машині:

```python
if torch.cuda.is_available():
    device, dtype = "cuda", torch.float16
elif torch.backends.mps.is_available():
    device, dtype = "mps", torch.float32   # fp16 на MPS часто дає чорні кадри
else:
    device, dtype = "cpu", torch.float32
```

**Модель качається один раз** (~2 GB із `variant="fp16"`) у `~/.cache/huggingface`.
Тримай `HF_HOME` в env, щоб не загубити кеш при переустановці.

## Batch-скрипт

Мінімальний робочий скелет:

```python
# card-forge/forge.py
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
import torch, json, hashlib, pathlib

pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID, torch_dtype=dtype, variant="fp16",
    safety_checker=None, requires_safety_checker=False,
).to(device)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_vae_slicing()   # attention_slicing додавати ТІЛЬКИ при OOM

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
