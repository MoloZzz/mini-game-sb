"""Case (loot box) container art: generation + promotion.

Separate pipeline from recipes.py/batch.py on purpose - cases are a different
subject family (containers, not creatures or the sword/potion/crystal objects)
and produce a single hero image per case rather than a reviewed pool, so they
don't belong in manifest.json (that file's rows must stay valid IngestCardInput,
which has no field for a container's slug/name).

Two-step, so a bad generation never silently overwrites a placeholder:
  1. `forge.py cases generate` -> N candidates per case into
     storage/cases/_candidates/<slug>-<seed>.png, logged to case_gen_log.json.
  2. `forge.py cases promote --case <slug> --seed <seed>` -> copies the chosen
     candidate to storage/cases/<slug>.png (the path packages/shared-types'
     CASE_SEEDS.imagePath expects) and records the choice in the log.
"""

from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from recipes import clip_token_count, _clean  # reuse the same CLIP-safety check


@dataclass(frozen=True)
class CaseRecipe:
    slug: str
    name: str
    element: str | None
    tier: str
    base_seed: int
    candidates: int
    cfg_scale: float
    steps: int
    prompt: str


@dataclass(frozen=True)
class CaseRecipeSet:
    style: str
    quality: str
    negative: str
    cases: list[CaseRecipe]


def load_case_recipes(path: str | Path) -> CaseRecipeSet:
    import yaml

    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)

    if not isinstance(data, dict):
        raise ValueError(f"case_recipes.yaml: top-level document must be a mapping ({path})")

    style = data.get("style")
    quality = data.get("quality")
    negative = data.get("negative")
    if not isinstance(style, str) or not style.strip():
        raise ValueError("case_recipes.yaml: 'style' must be a non-empty string")
    if not isinstance(quality, str) or not quality.strip():
        raise ValueError("case_recipes.yaml: 'quality' must be a non-empty string")
    if not isinstance(negative, str) or not negative.strip():
        raise ValueError("case_recipes.yaml: 'negative' must be a non-empty string")
    style = _clean(style)
    quality = _clean(quality)
    negative = _clean(negative)

    tiers = data.get("tiers", {})
    elements = data.get("elements", {})
    if not isinstance(tiers, dict) or not tiers:
        raise ValueError("case_recipes.yaml: 'tiers' must be a non-empty mapping")

    raw_cases = data.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise ValueError("case_recipes.yaml: 'cases' must be a non-empty list")

    seen_slugs: set[str] = set()
    cases: list[CaseRecipe] = []
    for raw in raw_cases:
        if not isinstance(raw, dict):
            raise ValueError(f"case_recipes.yaml: case entries must be mappings, got {raw!r}")

        slug = raw.get("slug")
        if not isinstance(slug, str) or not slug.strip():
            raise ValueError(f"case_recipes.yaml: case missing valid 'slug' ({raw!r})")
        if slug in seen_slugs:
            raise ValueError(f"case_recipes.yaml: duplicate case slug '{slug}'")
        seen_slugs.add(slug)

        name = raw.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"case_recipes.yaml: case '{slug}' missing valid 'name'")

        fragment = raw.get("fragment")
        if not isinstance(fragment, str) or not fragment.strip():
            raise ValueError(f"case_recipes.yaml: case '{slug}' missing valid 'fragment'")

        element = raw.get("element")
        element_frag = None
        if element is not None:
            element_frag = elements.get(element)
            if not isinstance(element_frag, str) or not element_frag.strip():
                raise ValueError(f"case_recipes.yaml: elements missing entry for '{element}' (used by '{slug}')")

        tier = raw.get("tier")
        tier_entry = tiers.get(tier)
        if not isinstance(tier_entry, dict):
            raise ValueError(f"case_recipes.yaml: tiers missing entry for '{tier}' (used by '{slug}')")
        tier_frag = tier_entry.get("fragment")
        if not isinstance(tier_frag, str) or not tier_frag.strip():
            raise ValueError(f"case_recipes.yaml: tiers['{tier}'] missing 'fragment' (used by '{slug}')")
        cfg_scale = float(tier_entry.get("cfg_scale", 7.0))
        steps = int(tier_entry.get("steps", 28))

        base_seed = raw.get("base_seed")
        if not isinstance(base_seed, int) or isinstance(base_seed, bool) or base_seed < 0:
            raise ValueError(f"case_recipes.yaml: case '{slug}' has invalid base_seed '{base_seed}'")

        candidates = raw.get("candidates", 5)
        if not isinstance(candidates, int) or isinstance(candidates, bool) or candidates < 1:
            raise ValueError(f"case_recipes.yaml: case '{slug}' has invalid candidates '{candidates}'")

        fragments = [style, fragment]
        if element_frag:
            fragments.append(element_frag)
        fragments.append(tier_frag)
        fragments.append(quality)
        cleaned = [_clean(f) for f in fragments if f and _clean(f)]
        prompt = ", ".join(cleaned).rstrip(", ").rstrip(",")

        token_count, exact = clip_token_count(prompt)
        if token_count > 77:
            qualifier = "" if exact else " (estimated)"
            print(
                f"WARN: case '{slug}' prompt is {token_count} tokens{qualifier}, over CLIP's "
                f"limit of 77 - the tail will be dropped SILENTLY."
            )

        cases.append(
            CaseRecipe(
                slug=slug,
                name=name,
                element=element,
                tier=tier,
                base_seed=base_seed,
                candidates=candidates,
                cfg_scale=cfg_scale,
                steps=steps,
                prompt=prompt,
            )
        )

    return CaseRecipeSet(style=style, quality=quality, negative=negative, cases=cases)


def _load_log(log_path: Path) -> dict:
    if not log_path.exists():
        return {}
    return json.loads(log_path.read_text(encoding="utf-8"))


def _save_log(log_path: Path, log: dict) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def run_cases_generate(
    recipes_path: Path,
    storage_dir: Path,
    log_path: Path,
    model_id: str,
    case_filter: str | None = None,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
    dry_run: bool = False,
) -> int:
    try:
        rs = load_case_recipes(recipes_path)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        return 1

    cases_list = rs.cases
    if case_filter:
        cases_list = [c for c in cases_list if c.slug == case_filter]
        if not cases_list:
            print(f"ERROR: no case with slug '{case_filter}'")
            return 1

    storage_dir = Path(storage_dir)
    cases_dir = storage_dir / "cases"
    candidates_dir = cases_dir / "_candidates"

    if dry_run:
        print("=== case art: dry run ===")
        total = 0
        for c in cases_list:
            print(f"{c.slug:<22} tier={c.tier:<10} element={str(c.element):<8} "
                  f"candidates={c.candidates} cfg={c.cfg_scale} steps={c.steps} "
                  f"tokens={clip_token_count(c.prompt)[0]}")
            total += c.candidates
        print(f"total candidate images: {total}")
        return 0

    import torch
    import pipeline as pipeline_mod

    candidates_dir.mkdir(parents=True, exist_ok=True)
    log = _load_log(log_path)

    pipe = None
    try:
        pipe, device, dtype = pipeline_mod.load_pipeline(model_id, attention_slicing, cpu_offload)
        pipeline_mod.reset_peak_vram()

        for c in cases_list:
            entry = log.setdefault(c.slug, {"name": c.name, "candidates": {}})
            for i in range(c.candidates):
                seed = c.base_seed + i
                fname = f"{c.slug}-{seed:x}.png"
                out_path = candidates_dir / fname
                if out_path.exists() and str(seed) in entry["candidates"]:
                    print(f"skip {fname} (already generated)")
                    continue

                gen = torch.Generator(device=device).manual_seed(seed)
                t0 = time.monotonic()
                try:
                    result = pipe(
                        prompt=c.prompt,
                        negative_prompt=rs.negative,
                        num_inference_steps=c.steps,
                        guidance_scale=c.cfg_scale,
                        width=pipeline_mod.WIDTH,
                        height=pipeline_mod.HEIGHT,
                        generator=gen,
                    )
                except Exception as exc:
                    oom_type = getattr(torch.cuda, "OutOfMemoryError", ())
                    is_oom = isinstance(exc, oom_type) or "out of memory" in str(exc).lower()
                    if not is_oom:
                        raise
                    print(f"ERROR: OOM generating case={c.slug} seed={seed}")
                    _save_log(log_path, log)
                    return 1

                image = result.images[0]
                image.save(out_path)
                elapsed = time.monotonic() - t0
                entry["candidates"][str(seed)] = {
                    "file": f"_candidates/{fname}",
                    "prompt": c.prompt,
                    "negativePrompt": rs.negative,
                    "seed": seed,
                    "steps": c.steps,
                    "cfgScale": c.cfg_scale,
                    "model": model_id,
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                }
                print(f"{c.slug:<22} seed={seed} {elapsed:.1f}s -> {out_path}")
                _save_log(log_path, log)
    finally:
        if pipe is not None:
            pipeline_mod.free_pipeline(pipe)

    peak = pipeline_mod.peak_vram_mib()
    if peak is not None:
        print(f"peak VRAM: {peak:.1f} MiB")
    return 0


def run_case_promote(slug: str, seed: int, storage_dir: Path, log_path: Path) -> int:
    """Copy a reviewed candidate to storage/cases/<slug>.png and record the choice."""
    storage_dir = Path(storage_dir)
    cases_dir = storage_dir / "cases"
    candidates_dir = cases_dir / "_candidates"

    fname = None
    for p in candidates_dir.glob(f"{slug}-*.png"):
        # filename is f"{slug}-{seed:x}.png"; match on the hex seed exactly.
        if p.stem == f"{slug}-{seed:x}":
            fname = p
            break
    if fname is None or not fname.exists():
        print(f"ERROR: no candidate file found for slug='{slug}' seed={seed} in {candidates_dir}")
        return 1

    dest = cases_dir / f"{slug}.png"
    shutil.copyfile(fname, dest)
    print(f"promoted {fname} -> {dest}")

    log = _load_log(log_path)
    entry = log.setdefault(slug, {"candidates": {}})
    entry["chosen_seed"] = seed
    entry["chosen_file"] = f"{slug}.png"
    entry["chosen_at"] = datetime.now(timezone.utc).isoformat()
    _save_log(log_path, log)
    return 0
