# card-forge

## What this is

An offline Stable Diffusion 1.5 batch generator that produces 512x512 fantasy card ART ONLY. The card frame, name, stats and flavor text are DOM/CSS in the game UI; SD 1.5 cannot render readable text (a CLIP encoder limitation, not a prompt problem). Generation happens entirely offline and never during play. card-forge assigns no rarities that are binding: `suggestedRarity` is a hint the human review step may override.

## Status

The pipeline is complete and the environment is verified, but **no images have been generated yet** — that was deliberately deferred to the operator. `storage/cards/` and `storage/thumbs/` are empty by design, and there is no `manifest.json` until the first batch runs.

Verified without generating anything:

| Check | Result |
|---|---|
| `forge.py doctor` | exits 0, CUDA `True`, RTX 3050 Laptop GPU, 4095.5 MiB total / 3299.7 MiB free, fp16 |
| `recipes.yaml` | parses; 34 recipes, 283 images; per-rarity CFG/steps match the spec |
| Prompt lengths | measured with the real CLIP tokenizer: 62-76 tokens, none truncated |
| `manifest_models.py` | field-for-field match with `IngestCardInput` / `GenMeta` in `packages/shared-types` |
| `ingest` idempotency | against `mock_api.py`: run 1 `inserted=6 skipped=0`, run 2 `inserted=0 skipped=6` |
| `ingest` with API down | exits 2 with a readable message, no traceback |
| Batch resume | skips slugs already on disk, including the half-written png-without-webp case |

**Not verified — it needs the ~2 GB model download and the GPU:** full `StableDiffusionPipeline.from_pretrained` assembly, `.to("cuda")`, the denoise loop, real seconds-per-image, and real peak VRAM. The numbers below for timing are the spec's estimates, not measurements.

## Requirements / verified hardware

- NVIDIA GeForce RTX 3050 Laptop GPU, 4096 MiB VRAM
- Python 3.11 (`py -3.11`) — the system default 3.14 has no torch wheels
- Windows

## Setup

Run these commands from `card-forge/`:

```
py -3.11 -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip
.venv/Scripts/python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe forge.py doctor
```

`doctor` must print `True` and `NVIDIA GeForce RTX 3050 Laptop GPU`. If it prints False, torch was installed from the wrong index — uninstall and reinstall from the CUDA index above.

## Commands

- `forge.py doctor` — environment diagnostic, exits non-zero if CUDA is missing or device 0 is unusable.
- `forge.py batch [--config recipes.yaml] [--limit N] [--recipe ID] [--dry-run] [--attention-slicing] [--cpu-offload]`
- `forge.py ingest [--manifest manifest.json] [--api-url URL] [--chunk-size N]`
- `forge.py order run --id <uuid>` — manually lease and process one specific ready admin order.
- `forge.py order worker [--poll-interval 5]` — continuously lease the oldest ready order, generate it, and submit candidates. It keeps one SD pipeline resident between orders and is the command started by `npm run dev`.
- `mock_api.py [--port 3000]` — stdlib mock of the ingest endpoint, for testing idempotency without game-api.

## Admin-order worker

Set the same `FORGE_SERVICE_TOKEN` for the API and Forge, start the API, then run:

```
.venv/Scripts/python.exe forge.py order worker
```

The worker polls `POST /admin/generation-orders/claim-next`. An empty queue returns `null`; it waits and tries again. A claimed order is passed directly to generation, so it is never claimed twice. Orders use compact technical tags so the visual brief is the primary prompt content. If a very long brief still exceeds CLIP's 77-token limit, Forge deterministically removes words from its end and logs that it trimmed it. `--once` is available for one-order diagnostics.

## Before any real batch — checklist

1. **Close Chrome and Discord.** On 4 GB that is 300-800 MB, not superstition.
2. **Confirm hybrid graphics.** Windows Settings > Display > Graphics: the desktop and browser must run on the **Radeon iGPU**, with only Python on the 3050. If the desktop sits on the 3050 it eats 0.5-1 GB and the VRAM budget stops adding up.
3. **Run `forge.py doctor`.** It warns if free VRAM is unusually low. Note that ~3300 MiB free is the *normal* idle reading — torch's own CUDA context costs ~660 MiB, so `nvidia-smi` showing 0 MiB used and `doctor` showing 3300 MiB free are the same healthy state.
4. **Plan first with `--dry-run`.** It prints the full work list, per-recipe token counts and an estimate without loading a model.

## Staged rollout — do not generate all 283 at once

Run from `card-forge/`. The first command also downloads the model (~2 GB, once).

**1. Smoke test — 6 images, one recipe, different seeds.** Proves the pipeline is alive.
```
.venv/Scripts/python.exe forge.py batch --recipe beast_fire_legendary --limit 6
```

**2. ~20 images across 4 recipes.** This is the step that unblocks the UI reel work — do not sit through a long batch before there is an API or a UI.
```
.venv/Scripts/python.exe forge.py batch --recipe beast_fire_legendary     --limit 5
.venv/Scripts/python.exe forge.py batch --recipe undead_shadow_epic       --limit 5
.venv/Scripts/python.exe forge.py batch --recipe humanoid_water_uncommon  --limit 5
.venv/Scripts/python.exe forge.py batch --recipe beast_earth_common       --limit 5
```
(The smoke batch already produced 6 of `beast_fire_legendary`, so its `--limit 5` is a no-op that reports "Nothing to do" — that is the resume logic working, not an error.)

**3. Tune prompts** in `recipes.yaml` based on what actually came out.

**4. Full batch — one command.**
```
.venv/Scripts/python.exe forge.py batch
```
283 images. The spec estimates ~30 minutes of pure compute, 40-50 minutes with laptop thermal throttling. Safe to interrupt with Ctrl+C and resume by re-running the identical command. Review down to the 110-card target pool afterwards.

## If the smoke batch fails

Check these in order.

**1. A dependency version mismatch — the most likely cause.** This install pairs `diffusers==0.39.0` with `transformers==5.14.1`, and diffusers declares only `transformers>=4.41.2` with no upper bound. That is a newer pairing than most SD 1.5 guidance online assumes, and pipeline construction is exactly where such combinations break.

What was checked directly and works: diffusers imports every CLIP symbol it needs from transformers 5.14.1; `StableDiffusionPipeline` and `DPMSolverMultistepScheduler` both resolve and the scheduler instantiates; `CLIPTextModel.from_pretrained` loads a real SD 1.5 text_encoder checkpoint with all 196 weight keys and a correct trained token-embedding std of 0.01395; `AutoencoderKL` loads with `variant="fp16"` and `enable_slicing()` works.

What could not be checked without the full download: assembling the whole pipeline and running the denoise loop. If it fails with an `ImportError`, a missing-attribute error, or a "newly initialized weights" warning from inside `from_pretrained`, downgrade transformers into the 4.x line first and retry:
```
.venv/Scripts/python.exe -m pip install "transformers<5"
```
That will also pull `huggingface-hub` back below 1.0. Record whatever combination works in `requirements.txt`.

**2. OOM.** Re-run the same command — completed images are skipped, so it resumes. If it recurs, add `--attention-slicing` (costs 20-30% speed), and only if that is still not enough, `--cpu-offload` (3-5x slower).

**3. A CPU-only torch build.** `doctor` catches this and names it explicitly: `torch.version.cuda: None` means the wrong wheel is installed.

## Resumability

The batch skips any slug whose PNG **and** WebP already exist, so an interrupted run resumes by re-running the same command. A half-written pair (PNG present, WebP missing) is regenerated rather than skipped. The manifest is written incrementally — every 5 images and on exit — so Ctrl+C or a crash never loses the record of what is already on disk.

## Output layout

```
storage/cards/{slug}.png     512x512 PNG
storage/thumbs/{slug}.webp   256x256 WebP
card-forge/manifest.json     matches IngestCardInput from packages/shared-types
```

slug format: `{recipe_id}-{seed:x}` truncated to 48 chars (longest in the current set is 30 chars, and all 283 are unique). The seed is always recorded in the manifest, so a good card can be reproduced exactly or varied with seed +/- 1..5 for other takes on the same composition.

## Ingest

`ingest` POSTs `manifest.json` to `POST /admin/cards/ingest` on game-api in chunks, sending an `X-Service-Token` header set from `FORGE_SERVICE_TOKEN` (see Environment variables above). It is idempotent by slug: a second run inserts nothing. If game-api is not running, ingest exits with a clear message and code 2; that is expected, the images are already on disk and ingest can be re-run later. If game-api rejects the token (401/403), ingest exits with a message naming `FORGE_SERVICE_TOKEN` so the mismatch is obvious.

To verify idempotency without game-api, in two terminals (with `FORGE_SERVICE_TOKEN` set in the environment — `mock_api.py` does not check it, but `forge.py ingest` still requires it to be set before sending anything):
```
.venv/Scripts/python.exe mock_api.py --port 3000
.venv/Scripts/python.exe forge.py ingest --api-url http://localhost:3000/api
.venv/Scripts/python.exe forge.py ingest --api-url http://localhost:3000/api
```
The second run must report `inserted=0`.

## 4 GB VRAM notes

- fp16 and `safety_checker=None` are requirements, not optimizations; the safety checker alone loads ~1.2 GB of CLIP, which on 4 GB is the difference between running and OOM. It is also meaningless for dragons.
- `DPMSolverMultistepScheduler` replaces the default PNDM: same quality at 20-28 steps instead of 50.
- `enable_vae_slicing()` is on; `enable_attention_slicing()` is OFF by default (torch 2.x SDPA is already memory-efficient and faster; slicing costs 20-30% speed) and `enable_model_cpu_offload()` is OFF by default (3-5x slower). Both are reactions to a real OOM, not prophylactics — hence the CLI flags.
- 512x512 only. Generating directly at 768 or 1024 produces doubled heads and extra limbs; that is outside SD 1.5's training distribution and cannot be fixed by prompting.
- Never keep two pipelines resident. `free_pipeline()` does `del` + `gc.collect()` + `empty_cache()` between stages.
- Known impossible on 4 GB: SDXL, ControlNet over SD 1.5 at 512, >512 generation, LoRA training, AnimateDiff.
- The model (~2 GB with `variant="fp16"`) downloads once into the HuggingFace cache. Set `HF_HOME` to keep it somewhere stable.

## Prompt notes

- Anatomy: `[STYLE] + [ARCHETYPE] + [ELEMENT] + [RARITY MODIFIER] + [QUALITY]`, style first because early tokens dominate.
- **One STYLE across the whole set.** That is what makes ~280 images read as one collection rather than a random folder. Never vary it per recipe.
- The NEGATIVE prompt includes `text, letters, words, frame, border` deliberately: SD loves drawing pseudo-text and frames, and the frame is CSS.
- **CLIP truncates at 77 tokens, silently, from the end.** Measured with the real tokenizer, the shipped prompts run 62-76 tokens — the longest (`beast_fire_legendary`, `spirit_shadow_mythic`) sit at 76, so there is almost no headroom. If you add words to STYLE or a rarity fragment, remove something else. `forge.py batch --dry-run` prints the exact per-recipe count in its `~tok` column, and `load_recipes` warns loudly on anything over 77.
- The QUALITY tail here is `highly detailed, sharp focus, 8k`. The spec's version also had `artstation trending`, which cost 4 tokens and pushed the five longest recipes to 78-80 — over the limit. Since truncation eats the tail, those recipes were losing their quality tags entirely; dropping the weakest booster keeps every rarity fragment intact instead.
- Prompt weights like `(word:1.3)` need `compel` in pure diffusers — deliberately not a dependency; reordering tokens gets most of the effect.
- Rarity drives CFG and steps: common 6.0/22 up to mythic 8.5/40. The lower CFG for common is intentional — the model "tries less" and common looks common.

## Pool coverage

`count` is roughly x2.5 the rarity's target pool size, because manual review approves well under half. The small pools round up harder — you cannot generate 2.5x of a 2-card target and get a usable sample.

| Rarity | Recipes | Generated | Pool target | Ratio |
|---|---|---|---|---|
| common | 10 | 100 | 40 | 2.50x |
| uncommon | 8 | 72 | 30 | 2.40x |
| rare | 6 | 48 | 20 | 2.40x |
| epic | 5 | 35 | 12 | 2.92x |
| legendary | 3 | 18 | 6 | 3.00x |
| mythic | 2 | 10 | 2 | 5.00x |
| **total** | **34** | **283** | **110** | |

## Recipe journal

Keep a running note of `recipe id -> what actually came out`. After 20 batches nobody remembers why one recipe worked and a neighbouring one did not. The vault calls this the most valuable artifact of the whole process.

## Environment variables

Read from `.env` at repo root or `card-forge/.env` if present; real environment variables win over both. `FORGE_API_URL`, `FORGE_SERVICE_TOKEN`, `FORGE_STORAGE_DIR`, `FORGE_MODEL_ID`, `FORGE_ORDER_POLL_INTERVAL`, `HF_HOME`.

`FORGE_SERVICE_TOKEN` is required by `forge.py ingest`: game-api's `POST /admin/cards/ingest` is protected by a `ServiceTokenGuard` that checks an `X-Service-Token` header against its own `FORGE_SERVICE_TOKEN` environment variable. Set both to the same value. There is no default — `ingest` fails fast with a clear message if it is unset, instead of sending a request game-api will reject with 401/403.
