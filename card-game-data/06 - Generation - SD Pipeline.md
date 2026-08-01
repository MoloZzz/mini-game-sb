---
tags: [generation, stable-diffusion]
---

# Generation Pipeline

Back to [[00 - Card Game MOC]] · Prompts → [[07 - Generation - Prompt Recipes]]

## Key Decision: SD Draws Only the Art, Not the Card

**Do not try to generate a finished card with a frame, name, and stats.**
SD 1.5 cannot physically draw readable text — this is not a prompt issue;
it is an architectural limitation (the CLIP encoder has no character-level understanding).
Attempts will produce scribbles that look like letters.

Instead:

```
┌─────────────────────┐
│  EMBER DRAKE   ⚔12  │  ← DOM / CSS
│ ┌─────────────────┐ │
│ │                 │ │
│ │   square art    │ │  ← the only thing SD does
│ │   art 512×512   │ │     (then upscale)
│ │                 │ │
│ └─────────────────┘ │
│ \"Its breath...\"  🛡7│  ← DOM / CSS
└─────────────────────┘
   frame = CSS/SVG, color by rarity
```

Hearthstone and MTG do the same: the art is a window inside the frame.
Benefits: text is perfect, the frame can change without regeneration, localization
is free, and rarity can be reassigned without touching the file.

## Model: Do Not Use Base SD 1.5

The base `runwayml/stable-diffusion-v1-5` is mediocre for fantasy art —
muddled details, poor anatomy, dull colors. Fine-tunes of the same
architecture (same code, same VRAM, same 4GB) produce dramatically better results.

| Model | When to use it |
|---|---|
| `Lykon/dreamshaper-8` | **default.** Universal, good for fantasy creatures |
| `Lykon/absolute-reality-1.81` | if you want more realistic dark fantasy |
| `runwayml/stable-diffusion-v1-5` | base, for comparison only |

All of these are SD 1.5 under the hood — the `diffusers` code does not change, only the
`model_id` string. Try two or three and keep the one you like.

## Resolution: 512×512, Period

SD 1.5 was trained at 512×512. Generating directly at 768 or 1024 produces
**doubled heads, extra limbs, and duplicated torsos** — this is not a prompt bug;
it is outside the training distribution.

Pipeline:
```
SD 1.5 → 512×512 → (optional) Real-ESRGAN ×2 → 1024×1024 → WebP
                                                    └→ thumb 256×256 WebP
```

Upscaling should be a separate, optional step — it is not free on the CPU either.
For the first iteration, 512 is entirely sufficient: the art occupies ~280px on the card.

Square, not portrait, because square is closest to the training distribution,
and the art window on the card is square anyway.

## Hardware — RTX 3050 Laptop, 4 GB VRAM

**Target hardware (defined):**
Ryzen 7 4800H · 32 GB RAM · **RTX 3050 Laptop, 4 GB VRAM** · Radeon iGPU · Windows

This works, but 4 GB is the lower limit. Several “optional” flags become
mandatory.

### VRAM Budget at 512×512, fp16, batch=1

| Component | ~Size |
|---|---|
| UNet fp16 | 1.7 GB |
| Text encoder (CLIP) | 0.25 GB |
| VAE | 0.16 GB |
| **Total weights** | **~2.1 GB** |
| Activations during diffusion | 0.8–1.4 GB |
| Driver / WDDM reserve | 0.2–0.4 GB |
| **Peak** | **~3.1–3.9 GB** |

It fits in 4 GB, but with no headroom. Therefore:

### Required

```python
pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.float16,   # NOT float32 — fp32 cannot fit at all
    variant="fp16",              # downloads ~2 GB instead of ~4 GB
    safety_checker=None,         # frees ~1.2 GB — the biggest single saving
    requires_safety_checker=False,
).to("cuda")
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_vae_slicing()        # cheap insurance during decoding
```

`safety_checker=None` here is not a “saving,” but a necessity — this checker pulls
its own CLIP model at ~1.2 GB, and on 4 GB that is the difference between working and OOM.
It is pointless for dragons anyway.

**Do NOT add `enable_attention_slicing()` immediately.** With torch 2.x, built-in
SDPA is already memory-efficient and faster than manual slicing. Enable slicing only
if you actually encounter OOM — it costs ~20–30% speed.

**`enable_model_cpu_offload()` — only as a last resort.** It slows things
by 3–5×. With 32 GB RAM it is a real fallback, but it should not be needed at 512×512.

### Real Timings on RTX 3050 Laptop

| Profile | Steps | ~sec/image |
|---|---|---|
| Common | 22 | ~4 s |
| Rare | 28 | ~5 s |
| Legendary | 35 | ~6.5 s |
| Mythic | 40 | ~7.5 s |

**A full batch of 283 cards takes ≈ 30 minutes of pure computation.**
Accounting for laptop throttling under sustained load: **40–50 minutes.**
That is one coffee break, not overnight. The target pool of 110 cards remains unchanged,
and a ×3 defect buffer can be allowed instead of ×2.5.

### Pitfalls of This Configuration

**1. Hybrid graphics.** The laptop has two GPUs. In Windows,
check Settings → Display → Graphics to ensure the display and browser use the **Radeon iGPU**,
while Python uses the 3050. If the display runs on the 3050, it gives 0.5–1 GB to
the desktop, and the budget above no longer fits.

**2. Chrome/Electron eat VRAM.** Close the browser and Discord before the batch.
At 4 GB this is not superstition — it is 300–800 MB.

**3. Torch must be installed from the CUDA index.** The default `pip install torch`
on Windows may install a CPU build and then silently compute on the processor.
Use the current command from pytorch.org (of the form
`pip install torch --index-url https://download.pytorch.org/whl/cuXXX`)
and check immediately:
```python
import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))
# expected: True NVIDIA GeForce RTX 3050 Laptop GPU
```

**4. Do not leave the pipeline in memory between stages.** Upscale in a separate
pass after `del pipe; torch.cuda.empty_cache()` — Real-ESRGAN and SD
cannot coexist in 4 GB. Details in [[11 - Planning - Open Questions]], Q5.

**5. xformers is not needed.** Installing it on Windows is a separate version
quest, while the gain over built-in SDPA in torch 2.x is close to zero.

**6. What definitely will NOT work on 4 GB:** SDXL, ControlNet on top of SD 1.5 at 512,
768×768+ generation, and LoRA training. None of this is needed in the plan,
but it is worth knowing the limit before trying.

### Script Portability

Automatic device selection remains so the code works if you run it on another machine:

```python
if torch.cuda.is_available():
    device, dtype = "cuda", torch.float16
elif torch.backends.mps.is_available():
    device, dtype = "mps", torch.float32   # fp16 on MPS often produces black frames
else:
    device, dtype = "cpu", torch.float32
```

**The model is downloaded once** (~2 GB with `variant="fp16"`) to `~/.cache/huggingface`.
Keep `HF_HOME` in env so you do not lose the cache during reinstallation.

## Batch Script

Minimal working skeleton:

```python
# card-forge/forge.py
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
import torch, json, hashlib, pathlib

pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID, torch_dtype=dtype, variant="fp16",
    safety_checker=None, requires_safety_checker=False,
).to(device)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_vae_slicing()   # add attention_slicing ONLY on OOM

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

**`DPMSolverMultistep` instead of default PNDM** — the same quality in 20–28
steps instead of 50. Twice as fast without losses. This is the cheapest optimization here.

**Always save the seed.** Found a good card? You can reproduce it
exactly or vary around it (`seed ± 1..5` gives similar but different results).

Next: `python forge.py ingest` reads `manifest.json` and POSTs to
`/admin/cards/ingest` ([[03 - Architecture - API Contracts]]).

## Review Step — Do Not Skip It

SD 1.5 gives **approximately 40–60% usable results**. The rest have broken
anatomy, are muddled, or are simply boring. Therefore:

1. Generate **×2.5 the required amount**. Need 110 → generate ~280.
2. Everything enters the database as `status: draft`.
3. Admin grid: view as a contact sheet and click approve/reject.
4. On approval, assign a name, rarity, ATK/DEF, and flavor.
5. Only `approved` cards participate in drops.

This is the most underestimated step. People plan generation and forget that
someone has to filter out defects. Budget real time for it; this will be the longest
part of M1.

**Acceleration idea:** generate names and flavor with a separate LLM from the recipe
prompt and use them as defaults in the review form. Then approval is one click,
not filling out five fields.

## Generation Order

Do not generate all 110 at once. Order:

1. **6 cards from one recipe, different seeds** — verify that the pipeline works
2. **~20 cards, 4 recipes** — enough to develop the roulette (M3)
3. Tune prompts based on the results
4. Full batch of 280 → review → 110

Step 2 is important: 20 cards unlock all the remaining work. Do not spend
7 hours on a CPU batch while you still have neither an API nor a UI.
