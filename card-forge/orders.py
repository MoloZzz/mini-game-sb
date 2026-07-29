"""Offline runner for one server-authored generation order.

The API only owns durable work state; the SD pipeline remains local and is
never started by an HTTP request made during game play.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from recipes import load_recipes


def _request(method: str, url: str, token: str, payload: dict | None = None, timeout: float = 30.0) -> dict:
    import requests
    response = requests.request(method, url, json=payload, headers={"X-Service-Token": token}, timeout=timeout)
    if not response.ok:
        raise RuntimeError(f"API {method} {url} returned {response.status_code}: {response.text[:300]}")
    return response.json()


def _profile(order: dict, recipes_path: Path) -> tuple[str, str, int, float]:
    """Build a bounded prompt and reuse the calibrated rarity settings.

    A brief is deliberately capped before composition: SD 1.5 silently drops
    tokens after CLIP's limit, which is worse than a visible, deterministic
    truncation in an admin pipeline.
    """
    recipe_set = load_recipes(recipes_path)
    matching = [r for r in recipe_set.recipes if r.archetype == order["archetype"] and r.rarity == order["suggestedRarity"] and r.element == order["element"]]
    if not matching:
        matching = [r for r in recipe_set.recipes if r.archetype == order["archetype"] and r.rarity == order["suggestedRarity"]]
    if not matching:
        raise ValueError("No calibrated recipe matches this archetype and rarity")
    recipe = matching[0]
    brief = " ".join(str(order["brief"]).split())[:180]
    element = f", {order['element']} magic" if order["element"] else ""
    prompt = f"dark fantasy card illustration, centered subject, {brief}, {order['archetype']}{element}, {order['suggestedRarity']} rarity, painterly, dramatic lighting, highly detailed"
    return prompt, recipe_set.negative, recipe.steps, recipe.cfg_scale


def run_order(
    order_id: str,
    api_url: str,
    service_token: str,
    storage_dir: Path,
    model_id: str,
    recipes_path: Path,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
    dry_run: bool = False,
) -> int:
    api_url = api_url.rstrip("/")
    claim_url = f"{api_url}/admin/generation-orders/{order_id}/claim"
    try:
        order = _request("POST", claim_url, service_token)
        prompt, negative, steps, cfg_scale = _profile(order, recipes_path)
    except Exception as exc:
        print(f"ERROR: could not claim generation order: {exc}")
        return 1

    if dry_run:
        print(f"order={order_id} candidates={len(order['candidates'])} steps={steps} cfg={cfg_scale:.1f}")
        print(f"prompt={prompt}")
        return 0

    import torch
    from PIL import Image
    import pipeline as pipeline_mod

    cards_dir = Path(storage_dir) / "cards"
    thumbs_dir = Path(storage_dir) / "thumbs"
    cards_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    completed: list[dict] = []
    pipe = None
    try:
        pipe, device, _dtype = pipeline_mod.load_pipeline(model_id, attention_slicing, cpu_offload)
        for candidate in order["candidates"]:
            seed = int(candidate["seed"])
            generator = torch.Generator(device=device).manual_seed(seed)
            image: Image.Image = pipe(
                prompt=prompt,
                negative_prompt=negative,
                num_inference_steps=steps,
                guidance_scale=cfg_scale,
                width=pipeline_mod.WIDTH,
                height=pipeline_mod.HEIGHT,
                generator=generator,
            ).images[0]
            slug = candidate["slug"]
            image.save(cards_dir / f"{slug}.png")
            image.resize((256, 256), Image.LANCZOS).save(thumbs_dir / f"{slug}.webp", quality=90, method=6)
            completed.append({
                "candidateId": candidate["id"], "imagePath": f"cards/{slug}.png", "thumbPath": f"thumbs/{slug}.webp",
                "genMeta": {"model": model_id, "prompt": prompt, "negativePrompt": negative, "seed": seed,
                            "steps": steps, "cfgScale": cfg_scale, "sampler": "DPMSolverMultistep",
                            "width": pipeline_mod.WIDTH, "height": pipeline_mod.HEIGHT,
                            "recipeId": order["recipeProfile"], "generatedAt": datetime.now(timezone.utc).isoformat()},
            })
        _request("POST", f"{api_url}/admin/generation-orders/{order_id}/complete", service_token,
                 {"runId": order["runId"], "candidates": completed})
        print(f"completed order={order_id} candidates={len(completed)}")
        return 0
    except Exception as exc:
        print(f"ERROR: generation order failed: {exc}")
        try:
            _request("POST", f"{api_url}/admin/generation-orders/{order_id}/fail", service_token,
                     {"runId": order["runId"], "code": "FORGE_RUN_FAILED", "detail": str(exc)[:500]})
        except Exception as fail_exc:
            print(f"ERROR: could not report failure: {fail_exc}")
        return 1
    finally:
        if pipe is not None:
            pipeline_mod.free_pipeline(pipe)
