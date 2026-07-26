"""Batch image generation driver.

Builds the full work list from recipes.yaml, resumes across interrupted
runs by checking what is already on disk, generates images through the
diffusers pipeline defined in pipeline.py, and writes an IngestCardInput
manifest entry per image (saved incrementally so a crash never loses the
record of what is already on disk).

torch/diffusers/pipeline are imported lazily inside run_batch so that
--dry-run works on a machine with no torch installed.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

from manifest_models import GenMeta, IngestCardInput, load_manifest, merge_manifest, save_manifest
from recipes import Recipe, RecipeSet, approx_token_count, load_recipes

_SECONDS_PER_STEP_ESTIMATE = 0.2


def _fmt_duration(seconds: float) -> str:
    """Format seconds as MM:SS, or H:MM:SS once it runs past an hour."""
    total = max(0, int(round(seconds)))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def recipe_slug(recipe_id: str, seed: int) -> str:
    """Build the card slug for a recipe/seed pair.

    Recipe ids are snake_case (they are YAML keys and the `--recipe` filter
    argument), but game-api validates ingest slugs against /^[a-z0-9][a-z0-9-]*$/
    - lowercase-kebab, no underscores - and the seeded placeholder cards follow
    the same convention. Underscores here mean every ingest request fails with
    400, so the conversion happens at the boundary rather than in the recipe ids.
    """
    return f"{recipe_id.replace('_', '-')}-{seed:x}"[:48]


def _build_work_items(recipes_list: list[Recipe]) -> list[tuple[Recipe, int, str]]:
    items: list[tuple[Recipe, int, str]] = []
    for r in recipes_list:
        for i in range(r.count):
            seed = r.base_seed + i
            items.append((r, seed, recipe_slug(r.id, seed)))
    return items


def _already_done(cards_dir: Path, thumbs_dir: Path, slug: str, manifest_slugs: set[str]) -> bool:
    """An image counts as done only if it is BOTH on disk and in the manifest.

    Manifest rows are flushed every 5 images, so a hard kill (SIGKILL rather
    than Ctrl-C) leaves up to 4 images on disk with no manifest row. Keying
    resume on disk alone would skip those forever and they would never be
    ingested. Requiring both makes an interrupted run self-healing: the
    orphans are simply regenerated, deterministically, from the same seed.
    """
    return (
        slug in manifest_slugs
        and (cards_dir / f"{slug}.png").exists()
        and (thumbs_dir / f"{slug}.webp").exists()
    )


def _print_dry_run(
    recipes_path,
    storage_dir: Path,
    recipes_list: list[Recipe],
    all_items: list[tuple[Recipe, int, str]],
    planned_items: list[tuple[Recipe, int, str]],
    skip_count: int,
) -> None:
    planned_slugs = {slug for _, _, slug in planned_items}

    per_recipe: dict[str, dict] = {}
    for r in recipes_list:
        per_recipe[r.id] = {"recipe": r, "count": r.count, "planned": 0}

    for recipe, seed, slug in all_items:
        if slug in planned_slugs:
            per_recipe[recipe.id]["planned"] += 1

    print("=== card-forge batch: dry run ===")
    print(f"recipes file: {recipes_path}")
    print(f"storage dir: {storage_dir}")
    print()
    header = f"{'recipe':<30} {'rarity':<10} {'count':>5} {'planned':>7} {'cfg':>5} {'steps':>5} {'~tok':>5}"
    print(header)
    print("-" * len(header))
    for rid, stats in per_recipe.items():
        r: Recipe = stats["recipe"]
        tok = approx_token_count(r.prompt)
        print(
            f"{rid:<30} {r.rarity:<10} {stats['count']:>5} {stats['planned']:>7} "
            f"{r.cfg_scale:>5.1f} {r.steps:>5} {tok:>5}"
        )
    print("-" * len(header))

    total_planned = len(planned_items)
    total_full = len(all_items)
    total_remaining = total_full - skip_count - total_planned

    print(f"total recipes: {len(recipes_list)}")
    print(f"total images (full set): {total_full}")
    print(f"already on disk (skip): {skip_count}")
    print(f"planned this run: {total_planned}")
    if total_remaining > 0:
        print(f"remaining after this run (limit applied): {total_remaining}")

    est_seconds = sum(recipe.steps * _SECONDS_PER_STEP_ESTIMATE for recipe, _, _ in planned_items)
    print(f"estimated wall clock (~{_SECONDS_PER_STEP_ESTIMATE}s/step): {_fmt_duration(est_seconds)}")
    print("(dry run - no model loaded, no images generated)")


def run_batch(
    recipes_path,
    storage_dir: Path,
    manifest_path: Path,
    model_id: str,
    limit: int | None = None,
    recipe_filter: str | None = None,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
    dry_run: bool = False,
) -> int:
    try:
        rs: RecipeSet = load_recipes(recipes_path)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    recipes_list = rs.recipes
    if recipe_filter:
        filtered = [r for r in recipes_list if r.id == recipe_filter]
        if not filtered:
            available = ", ".join(r.id for r in recipes_list)
            print(f"ERROR: no recipe with id '{recipe_filter}'. Available ids: {available}")
            return 1
        recipes_list = filtered

    storage_dir = Path(storage_dir)
    manifest_path = Path(manifest_path)
    cards_dir = storage_dir / "cards"
    thumbs_dir = storage_dir / "thumbs"

    all_items = _build_work_items(recipes_list)

    # Loaded before the resume check: _already_done needs the manifest slugs.
    try:
        manifest_cards = load_manifest(manifest_path)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1
    manifest_slugs = {c.slug for c in manifest_cards}

    pending_items = [
        item for item in all_items if not _already_done(cards_dir, thumbs_dir, item[2], manifest_slugs)
    ]
    skip_count = len(all_items) - len(pending_items)

    orphans = [
        item[2]
        for item in pending_items
        if (cards_dir / f"{item[2]}.png").exists() and item[2] not in manifest_slugs
    ]
    if orphans:
        print(
            f"note: {len(orphans)} image(s) on disk have no manifest row "
            "(previous run was killed before its manifest flush); regenerating them."
        )

    planned_items = pending_items[:limit] if limit is not None else pending_items

    if dry_run:
        _print_dry_run(recipes_path, storage_dir, recipes_list, all_items, planned_items, skip_count)
        return 0

    if not planned_items:
        print("Nothing to do: all requested images already exist on disk.")
        print(f"skipped (already on disk): {skip_count}")
        return 0

    # Lazy imports: dry-run and error paths above must work with no torch installed.
    import torch
    from PIL import Image

    import pipeline as pipeline_mod

    cards_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    generated = 0
    completed_times: list[float] = []
    pending_manifest_cards: list[IngestCardInput] = []
    start_time = time.monotonic()
    total_planned = len(planned_items)

    pipe = None
    try:
        pipe, device, dtype = pipeline_mod.load_pipeline(model_id, attention_slicing, cpu_offload)
        pipeline_mod.reset_peak_vram()

        for idx, (recipe, seed, slug) in enumerate(planned_items, start=1):
            item_start = time.monotonic()

            try:
                gen = torch.Generator(device=device).manual_seed(seed)
            except Exception:
                # e.g. torch.Generator(device="mps") is unsupported on some builds.
                gen = torch.Generator().manual_seed(seed)

            try:
                result = pipe(
                    prompt=recipe.prompt,
                    negative_prompt=rs.negative,
                    num_inference_steps=recipe.steps,
                    guidance_scale=recipe.cfg_scale,
                    width=pipeline_mod.WIDTH,
                    height=pipeline_mod.HEIGHT,
                    generator=gen,
                )
            except Exception as exc:
                oom_type = getattr(torch.cuda, "OutOfMemoryError", ())
                is_oom = isinstance(exc, oom_type) or "out of memory" in str(exc).lower()
                if not is_oom:
                    raise
                print()
                print(f"ERROR: out of memory while generating recipe={recipe.id} slug={slug} seed={seed}")
                print("       Close memory-hungry apps (Chrome, Discord) and re-run the same command -")
                print("       it will resume from where it left off (already-generated images are skipped).")
                print("       If it still runs out of memory, retry with --attention-slicing,")
                print("       and if that is not enough, --cpu-offload.")
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
                manifest_cards = merge_manifest(manifest_cards, pending_manifest_cards)
                save_manifest(manifest_path, manifest_cards)
                return 1

            image = result.images[0]
            image.save(cards_dir / f"{slug}.png")
            thumb = image.resize((256, 256), Image.LANCZOS)
            thumb.save(thumbs_dir / f"{slug}.webp", quality=90, method=6)

            gen_meta = GenMeta(
                model=model_id,
                prompt=recipe.prompt,
                negativePrompt=rs.negative,
                seed=seed,
                steps=recipe.steps,
                cfgScale=recipe.cfg_scale,
                sampler="DPMSolverMultistep",
                width=pipeline_mod.WIDTH,
                height=pipeline_mod.HEIGHT,
                recipeId=recipe.id,
                generatedAt=datetime.now(timezone.utc).isoformat(),
            )
            card_input = IngestCardInput(
                slug=slug,
                imagePath=f"cards/{slug}.png",
                thumbPath=f"thumbs/{slug}.webp",
                suggestedRarity=recipe.rarity,
                archetype=recipe.archetype,
                element=recipe.element,
                genMeta=gen_meta,
            )
            pending_manifest_cards.append(card_input)
            generated += 1

            elapsed = time.monotonic() - item_start
            completed_times.append(elapsed)
            mean_time = sum(completed_times) / len(completed_times)
            eta_seconds = mean_time * (total_planned - idx)

            print(
                f"[{idx:>3}/{total_planned:>3}] {slug}  "
                f"seed={seed} steps={recipe.steps} cfg={recipe.cfg_scale:.1f}  "
                f"{elapsed:.1f}s  eta {_fmt_duration(eta_seconds)}"
            )

            if generated % 5 == 0 or idx == total_planned:
                manifest_cards = merge_manifest(manifest_cards, pending_manifest_cards)
                save_manifest(manifest_path, manifest_cards)
                pending_manifest_cards = []

    except KeyboardInterrupt:
        manifest_cards = merge_manifest(manifest_cards, pending_manifest_cards)
        save_manifest(manifest_path, manifest_cards)
        print()
        print(f"Interrupted: {generated} image(s) completed and saved to disk/manifest this run.")
        return 130
    finally:
        if pipe is not None:
            pipeline_mod.free_pipeline(pipe)

    total_wall = time.monotonic() - start_time
    mean_sec = (sum(completed_times) / len(completed_times)) if completed_times else 0.0
    peak_vram = pipeline_mod.peak_vram_mib()

    print()
    print("=== batch summary ===")
    print(f"generated: {generated}")
    print(f"skipped (already on disk): {skip_count}")
    print(f"total wall clock: {_fmt_duration(total_wall)}")
    print(f"mean seconds/image: {mean_sec:.1f}")
    if peak_vram is not None:
        print(f"peak VRAM: {peak_vram:.1f} MiB")
    else:
        print("peak VRAM: n/a (no CUDA device)")

    return 0
