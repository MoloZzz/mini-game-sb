"""Offline runner for one server-authored generation order.

The API only owns durable work state; the SD pipeline remains local and is
never started by an HTTP request made during game play.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from time import sleep

from recipes import load_recipes


def _request(method: str, url: str, token: str, payload: dict | None = None, timeout: float = 30.0) -> dict | None:
    import requests
    response = requests.request(method, url, json=payload, headers={"X-Service-Token": token}, timeout=timeout)
    if not response.ok:
        raise RuntimeError(f"API {method} {url} returned {response.status_code}: {response.text[:300]}")
    # Nest serializes a `null` controller result as an empty 200 response.
    # For claim-next that means the queue is idle, not that the worker failed.
    if not response.content or not response.content.strip():
        return None
    return response.json()


def _profile(order: dict, recipes_path: Path) -> tuple[str, str, int, float]:
    """Build an order profile from the reusable YAML profile tables."""
    recipe_set = load_recipes(recipes_path)
    return recipe_set.order_profile(
        archetype=order["archetype"],
        element=order["element"],
        rarity=order["suggestedRarity"],
        brief=str(order["brief"]),
    )


def _fail_order(api_url: str, service_token: str, order: dict, error: Exception) -> None:
    try:
        _request(
            "POST", f"{api_url}/admin/generation-orders/{order['id']}/fail", service_token,
            {"runId": order["runId"], "code": "FORGE_RUN_FAILED", "detail": str(error)[:500]},
        )
    except Exception as fail_exc:
        print(f"ERROR: could not report failure for order={order['id']}: {fail_exc}")


def run_claimed_order(
    order: dict,
    api_url: str,
    service_token: str,
    storage_dir: Path,
    model_id: str,
    recipes_path: Path,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
    dry_run: bool = False,
    pipe=None,
    device=None,
) -> tuple[int, object | None, object | None]:
    """Generate a previously leased order without attempting another claim.

    The worker passes its resident pipeline back into this function for each
    order. A manual `order run` simply calls the same path with no pipeline.
    """
    order_id = order["id"]
    try:
        prompt, negative, steps, cfg_scale = _profile(order, recipes_path)
        if dry_run:
            print(f"order={order_id} candidates={len(order['candidates'])} steps={steps} cfg={cfg_scale:.1f}")
            print(f"prompt={prompt}")
            return 0, pipe, device

        import torch
        from PIL import Image
        import pipeline as pipeline_mod

        if pipe is None:
            pipe, device, _dtype = pipeline_mod.load_pipeline(model_id, attention_slicing, cpu_offload)

        cards_dir = Path(storage_dir) / "cards"
        thumbs_dir = Path(storage_dir) / "thumbs"
        cards_dir.mkdir(parents=True, exist_ok=True)
        thumbs_dir.mkdir(parents=True, exist_ok=True)
        completed: list[dict] = []
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
        return 0, pipe, device
    except Exception as exc:
        print(f"ERROR: generation order={order_id} failed: {exc}")
        _fail_order(api_url, service_token, order, exc)
        return 1, pipe, device


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
    except Exception as exc:
        print(f"ERROR: could not claim generation order: {exc}")
        return 1
    pipe = None
    try:
        result, pipe, _device = run_claimed_order(
            order, api_url, service_token, storage_dir, model_id, recipes_path,
            attention_slicing, cpu_offload, dry_run,
        )
        return result
    finally:
        if pipe is not None:
            import pipeline as pipeline_mod
            pipeline_mod.free_pipeline(pipe)


def run_worker(
    api_url: str,
    service_token: str,
    storage_dir: Path,
    model_id: str,
    recipes_path: Path,
    poll_interval: float = 5.0,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
    dry_run: bool = False,
    once: bool = False,
) -> int:
    """Continuously lease and process ready orders with one resident pipeline."""
    if poll_interval <= 0:
        print("ERROR: poll interval must be greater than zero.")
        return 2

    api_url = api_url.rstrip("/")
    pipe = None
    device = None
    print(f"Forge worker started; polling {api_url}/admin/generation-orders/claim-next every {poll_interval:g}s")
    try:
        while True:
            try:
                order = _request("POST", f"{api_url}/admin/generation-orders/claim-next", service_token)
            except Exception as exc:
                print(f"ERROR: could not claim next generation order: {exc}")
                if once:
                    return 1
                sleep(poll_interval)
                continue

            if order is None:
                if once:
                    return 0
                sleep(poll_interval)
                continue

            _result, pipe, device = run_claimed_order(
                order, api_url, service_token, storage_dir, model_id, recipes_path,
                attention_slicing=attention_slicing,
                cpu_offload=cpu_offload,
                dry_run=dry_run,
                pipe=pipe,
                device=device,
            )
            if once:
                return _result
    finally:
        if pipe is not None:
            import pipeline as pipeline_mod
            pipeline_mod.free_pipeline(pipe)
