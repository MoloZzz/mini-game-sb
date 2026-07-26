# Part C — card-forge execution plan

**Owns:** `card-forge/` only (plus writing image files into `storage/`).
**Stack:** Python 3.11 + diffusers + torch (CUDA) + Pillow (+ thin FastAPI later).
**Spec:** vault docs 06, 07 + ADR-001/005/006/007/013.

## Verified hardware — not assumed

```
NVIDIA GeForce RTX 3050 Laptop GPU, 4096 MiB   ← confirmed via nvidia-smi
Python 3.11 available as `py -3.11`             ← confirmed via py -0p
```

**The system default Python is 3.14, which has no torch/diffusers wheels.**
Create the venv with `py -3.11 -m venv .venv`. Getting this wrong is the single
most likely way this part stalls.

4 GB VRAM is the lower bound that works. Peak at 512×512 fp16 batch=1 is
~3.1–3.9 GB, so several flags stop being optional (ADR-013).

## Sequencing

### C1 · Environment + doctor
- `py -3.11 -m venv .venv` inside `card-forge/`.
- **Install torch from the CUDA index**, not plain `pip install torch` — on
  Windows the default index can silently install a CPU build that then computes
  on the processor without ever saying so. Take the current command from
  pytorch.org (`--index-url https://download.pytorch.org/whl/cuXXX`).
- Then `diffusers transformers accelerate pillow pyyaml requests`.
- `python forge.py doctor` prints:
  ```
  torch.cuda.is_available()  → expect True
  torch.cuda.get_device_name(0) → expect NVIDIA GeForce RTX 3050 Laptop GPU
  free VRAM, torch version, resolved device/dtype, HF cache path
  ```
  and exits non-zero if CUDA is missing, with the fix in the message.
- **Done:** `doctor` reports `True NVIDIA GeForce RTX 3050 Laptop GPU`.

### C2 · Pipeline loader
```python
pipe = StableDiffusionPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.float16,   # fp32 cannot fit — ~4.2GB of weights alone
    variant="fp16",              # downloads ~2GB instead of ~4GB
    safety_checker=None,         # frees ~1.2GB — the largest single saving
    requires_safety_checker=False,
).to("cuda")
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
pipe.enable_vae_slicing()
```

- `safety_checker=None` is a **requirement, not a saving**: the checker loads its
  own ~1.2GB CLIP model, which on 4GB is the difference between running and OOM.
  It is also meaningless for dragons.
- **Do not enable `attention_slicing` by default.** torch 2.x SDPA is already
  memory-efficient and faster; slicing costs 20–30% speed. Add it only in
  response to an actual OOM.
- **Do not enable `model_cpu_offload` by default.** 3–5× slower. It is a real
  fallback with 32GB RAM, but at 512×512 it should never be needed.
- `DPMSolverMultistep` instead of the default PNDM: same quality in 20–28 steps
  instead of 50. The cheapest optimization available here.
- Keep device auto-selection (cuda / mps-fp32 / cpu) so the script survives being
  run on another machine. fp16 on MPS often produces black frames — hence fp32 there.
- **Do not skip xformers research** — it is deliberately *not* wanted: a version
  quest on Windows for ~zero gain over built-in SDPA.

### C3 · Recipes
`recipes.yaml` per vault 07. Prompt anatomy:

```
[STYLE] + [SUBJECT] + [ELEMENT] + [RARITY MODIFIER] + [QUALITY]
```

- **One STYLE across the whole set** — that is what makes 110 different images
  read as one collection rather than a random folder. Never vary it per recipe.
- NEGATIVE includes `text, letters, words, frame, border` deliberately: SD loves
  to draw pseudo-text and frames, and the frame is CSS (ADR-005).
- Rarity drives CFG and steps: common 6.0/22 → mythic 8.5/40. Lower CFG for
  common is intentional — the model "tries less" and common looks common.
- **CLIP truncates at 77 tokens.** The given prompts land around 60–70. Anything
  added silently drops the tail.
- Prompt weights `(word:1.3)` need `compel` in pure diffusers — don't pull it in;
  reordering tokens gives ~80% of the effect. Order matters: STYLE first because
  it should dominate.
- `count` is always **×2.5** the rarity's pool target — approval passes well
  under half.

### C4 · Batch script
`python forge.py batch --config recipes.yaml [--limit N] [--recipe ID]`

- 512×512 only (ADR-006). Generating directly at 768/1024 produces doubled heads
  and extra limbs — outside the training distribution, not fixable by prompting.
- Saves `storage/cards/{slug}.png` + `storage/thumbs/{slug}.webp` (256×256).
- **Always records the seed.** A good card can then be reproduced exactly, or
  varied with `seed ± 1..5` for variations on the same composition.
- Appends to `manifest.json` matching `IngestCardInput` from `shared-types`
  (the TS file is the authority for field names — mirror it in a pydantic model).
- Resumable: skip slugs already on disk, so an interrupted batch resumes.
- Progress output with ETA. A 283-card batch is ~45 min including throttling.

**Staged rollout — do not generate 110 at once.** The vault's order:
1. 6 cards, one recipe, different seeds → prove the pipeline is alive.
2. ~20 cards, 4 recipes → this unblocks all reel work in Part B.
3. Tune prompts based on what actually came out.
4. Full batch of ~283 → review → 110.

Step 2 matters most: 20 cards unblock everything else. Do not sit through a long
batch before there is an API or a UI.

### C5 · Ingest
`python forge.py ingest [--manifest manifest.json] [--api-url ...]`
POSTs to `/admin/cards/ingest` in chunks, idempotent by slug, prints
inserted/skipped. Must fail gracefully and clearly when game-api is not running
— that is the normal state during Part C's own development.

### C6 · Optional extras
- Thin FastAPI wrapper to trigger jobs from the admin UI and watch progress.
  **Start with the script, not FastAPI** — the wrapper is a thin layer on top.
- Upscaling: **not part of the generation loop.** SD and Real-ESRGAN do not
  coexist in 4GB. Best answer here is a separate **CPU** pass over approved cards
  only: ~5–10s each on the 4800H, ~15 minutes for 110 cards, and no VRAM
  juggling at all. There is no point upscaling images that will be rejected.
- A recipe journal (`recipe → what came out`). After 20 batches nobody remembers
  why `shadow_undead_epic` worked and `shadow_spirit_epic` didn't. The vault
  calls this the most valuable artifact of the whole process.

## Traps specific to this machine

1. **Hybrid graphics.** Two GPUs. Confirm in Windows Settings → Display →
   Graphics that display/browser run on the **Radeon iGPU** and Python on the
   3050. If the desktop sits on the 3050 it eats 0.5–1GB and the budget stops
   adding up.
2. **Chrome/Electron eat VRAM.** Close the browser and Discord before a batch —
   on 4GB that is 300–800MB, not superstition.
3. **Never keep two pipelines resident.** `del pipe; torch.cuda.empty_cache()`
   between stages.
4. **Known impossible on 4GB:** SDXL, ControlNet over SD 1.5 at 512, >512
   generation, LoRA training, AnimateDiff. None are in the plan — but the limit
   should be known in advance rather than discovered at OOM.

## Scope boundary
Generation happens **entirely offline** (ADR-001) and never during play.
card-forge owns no game state and assigns no rarities — `suggestedRarity` is a
hint the review step may override.

## Done criteria
- `doctor` green on CUDA.
- 6-card smoke batch completes with no OOM, files land in `storage/`.
- `recipes.yaml` covers 34 recipes summing to ~283 generated cards.
- `manifest.json` validates against `IngestCardInput`.
- `ingest` is idempotent — running it twice inserts nothing the second time.
