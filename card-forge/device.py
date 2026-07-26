"""Device/dtype auto-selection and hardware diagnostics.

Target hardware for this project is an RTX 3050 Laptop GPU with 4096 MiB
VRAM. fp16 on CUDA is required to fit SD 1.5 generation in that budget.
MPS deliberately stays on fp32: fp16 on MPS has a long-standing history of
producing black/garbage frames with diffusers pipelines.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def resolve_device() -> tuple[str, "torch.dtype"]:
    """Pick the best available device and the dtype that is safe on it."""
    import torch

    if torch.cuda.is_available():
        return "cuda", torch.float16

    # mps is only present on torch builds shipped for Apple Silicon; guard
    # the attribute access so this does not explode on other platforms.
    try:
        has_mps = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    except Exception:
        has_mps = False
    if has_mps:
        # fp32 on purpose here: fp16 on MPS often produces black frames.
        return "mps", torch.float32

    return "cpu", torch.float32


def _resolve_hf_cache_path() -> Path:
    hf_home = os.environ.get("HF_HOME")
    if hf_home:
        return Path(hf_home).expanduser().resolve()
    hf_hub_cache = os.environ.get("HF_HUB_CACHE")
    if hf_hub_cache:
        return Path(hf_hub_cache).expanduser().resolve()
    return (Path.home() / ".cache" / "huggingface").resolve()


def _report_import(name: str) -> str:
    try:
        mod = __import__(name)
    except ImportError as exc:
        return f"  {name}: NOT AVAILABLE ({exc})"
    except Exception as exc:
        return f"  {name}: ERROR importing ({exc})"
    version = getattr(mod, "__version__", None)
    if version:
        return f"  {name}: OK (version {version})"
    return f"  {name}: OK (version unknown)"


def doctor() -> int:
    """Print a diagnostic report about the environment. Returns exit code."""
    print("=== card-forge doctor ===")
    print(f"python: {sys.version.split()[0]} ({sys.executable})")

    try:
        import torch
    except ImportError as exc:
        print(f"torch: FAILED TO IMPORT ({exc})")
        print()
        print("FIX: torch is not installed in this environment.")
        print("     Install it inside card-forge/.venv, using the CUDA index:")
        print("       .venv/Scripts/python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124")
        return 1

    print(f"torch.__version__: {torch.__version__}")
    cuda_build = getattr(torch.version, "cuda", None)
    print(f"torch.version.cuda: {cuda_build}")

    cuda_available = torch.cuda.is_available()
    print(f"torch.cuda.is_available(): {'True' if cuda_available else 'False'}")

    device_usable = cuda_available
    free_mib: float | None = None
    if cuda_available:
        try:
            name = torch.cuda.get_device_name(0)
            free_bytes, total_bytes = torch.cuda.mem_get_info()
            capability = torch.cuda.get_device_capability(0)
            total_mib = total_bytes / 1024**2
            free_mib = free_bytes / 1024**2
            print(f"  device name: {name}")
            print(f"  total VRAM: {total_mib:.1f} MiB")
            print(f"  free VRAM: {free_mib:.1f} MiB")
            print(f"  capability: {capability}")
        except Exception as exc:
            # is_available() can still report True while device 0 is unusable -
            # e.g. CUDA_VISIBLE_DEVICES="" masks every device. Generation would
            # fail later, so this has to be fatal here rather than a note.
            print(f"  ERROR: CUDA reports available but device 0 cannot be queried: {exc}")
            device_usable = False

    device, dtype = resolve_device()
    print(f"resolved device: {device}")
    print(f"resolved dtype: {dtype}")

    hf_cache = _resolve_hf_cache_path()
    print(f"HF cache path: {hf_cache} (exists: {hf_cache.exists()})")

    print("dependency check:")
    for name in ("diffusers", "transformers", "accelerate", "PIL", "yaml", "requests", "pydantic"):
        print(_report_import(name))

    if not cuda_available:
        print()
        print("FIX: torch was installed without CUDA support (or no NVIDIA driver is visible).")
        if cuda_build is None:
            print("     torch.version.cuda is None, which means a CPU-only wheel is installed.")
        print("     Reinstall inside card-forge/.venv with the CUDA index, not the default PyPI index:")
        print("       .venv/Scripts/python.exe -m pip uninstall -y torch")
        print("       .venv/Scripts/python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu124")
        return 1

    if not device_usable:
        print()
        print("FIX: CUDA is present but device 0 is not usable.")
        print("     Check that CUDA_VISIBLE_DEVICES is not set to an empty or invalid value,")
        print("     and that nothing else has claimed the GPU. Verify with: nvidia-smi")
        return 1

    # 4GB is the whole budget: peak at 512x512 fp16 batch=1 is ~3.1-3.9 GB.
    # Measured baseline on this machine: nvidia-smi shows 3962 MiB free at idle, but
    # mem_get_info reports 3300 MiB once torch has initialized its CUDA context - the
    # context itself costs ~660 MiB. So ~3300 MiB free IS the healthy idle reading, and
    # the threshold sits below it to flag only genuine competition for VRAM.
    if free_mib is not None and free_mib < 3000:
        print()
        print(f"WARNING: only {free_mib:.0f} MiB of VRAM free (~3300 MiB is the normal idle")
        print("         reading once torch's CUDA context is loaded). A 512x512 fp16 batch")
        print("         peaks at ~3.1-3.9 GB, so this is likely to OOM. Close Chrome and")
        print("         Discord, and confirm the desktop runs on the Radeon iGPU, not the 3050.")

    print()
    print("doctor: OK")
    return 0
