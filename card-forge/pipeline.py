"""Stable Diffusion pipeline construction tuned for a 4GB VRAM budget.

Target hardware: RTX 3050 Laptop, 4096 MiB VRAM. Peak usage at 512x512,
fp16, batch=1 sits around 3.1-3.9 GB, which is why every flag below is a
hard requirement rather than a nice-to-have: safety_checker alone costs
~1.2GB, and the fp16 variant halves the download versus fp32 weights.
"""

from __future__ import annotations

import gc
import os

from device import resolve_device

# SD 1.5-family checkpoints (dreamshaper-8 included) were trained at
# 512x512. Going to 768/1024 pushes the model outside its training
# distribution and reliably produces doubled heads and extra limbs, so
# this is intentionally not exposed as a CLI option.
WIDTH = 512
HEIGHT = 512

DEFAULT_MODEL_ID = os.environ.get("FORGE_MODEL_ID", "Lykon/dreamshaper-8")


def load_pipeline(
    model_id: str = DEFAULT_MODEL_ID,
    attention_slicing: bool = False,
    cpu_offload: bool = False,
):
    """Build and return (pipe, device, dtype).

    Only one pipeline should ever be resident at a time on this hardware;
    call free_pipeline() before loading another.
    """
    import torch
    from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline

    device, dtype = resolve_device()

    load_kwargs = dict(
        torch_dtype=dtype,
        safety_checker=None,  # frees ~1.2GB - on a 4GB card this is run-vs-OOM
        requires_safety_checker=False,
    )

    if dtype == torch.float16:
        # fp16 variant weights are a ~2GB download instead of ~4GB for fp32.
        try:
            pipe = StableDiffusionPipeline.from_pretrained(
                model_id, variant="fp16", **load_kwargs
            )
        except Exception as exc:
            print(
                f"note: fp16 variant load failed for '{model_id}' ({exc}); "
                "retrying without variant='fp16'"
            )
            pipe = StableDiffusionPipeline.from_pretrained(model_id, **load_kwargs)
    else:
        # cpu/mps run fp32; there is no fp16 variant to request there.
        pipe = StableDiffusionPipeline.from_pretrained(model_id, **load_kwargs)

    # Same quality as PNDM at 50 steps in 20-28 steps -> much faster batches.
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)

    pipe = pipe.to(device)
    pipe.enable_vae_slicing()
    pipe.set_progress_bar_config(disable=True)  # keep batch progress output readable

    if attention_slicing:
        pipe.enable_attention_slicing()

    if cpu_offload:
        pipe.enable_model_cpu_offload()

    flags = []
    if attention_slicing:
        flags.append("attention_slicing")
    if cpu_offload:
        flags.append("cpu_offload")
    flags_desc = ",".join(flags) if flags else "none"
    print(f"pipeline: model={model_id} device={device} dtype={dtype} flags={flags_desc}")

    return pipe, device, dtype


def free_pipeline(pipe) -> None:
    """Release a pipeline's resources. Never keep two pipelines resident."""
    import torch

    del pipe
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def peak_vram_mib() -> float | None:
    import torch

    if not torch.cuda.is_available():
        return None
    return torch.cuda.max_memory_allocated() / 1024**2


def reset_peak_vram() -> None:
    import torch

    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
