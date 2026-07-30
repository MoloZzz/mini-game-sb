#!/usr/bin/env python
"""card-forge CLI: generate SD card art and ingest it into the game API.

Usage:
    python forge.py doctor
    python forge.py batch [options]
    python forge.py ingest [options]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

CARD_FORGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = CARD_FORGE_DIR.parent


def _load_env_file(path: Path) -> None:
    """Minimal .env parser: KEY=VALUE per line, no external dependency.

    Skips blank lines and '#' comments, splits on the first '=', strips
    matching surrounding quotes, and never overwrites a key already present
    in os.environ (real environment variables win over the .env file).
    """
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def _load_dotenv_files() -> None:
    # repo root first, then card-forge (both optional; existing env wins).
    _load_env_file(REPO_ROOT / ".env")
    _load_env_file(CARD_FORGE_DIR / ".env")


def _default_storage_dir() -> Path:
    env_val = os.environ.get("FORGE_STORAGE_DIR")
    if env_val:
        return Path(env_val)
    return CARD_FORGE_DIR / ".." / "storage"


def _default_model_id() -> str:
    return os.environ.get("FORGE_MODEL_ID", "Lykon/dreamshaper-8")


def _default_api_url() -> str:
    return os.environ.get("FORGE_API_URL", "http://localhost:3000/api")


def _default_service_token() -> str | None:
    return os.environ.get("FORGE_SERVICE_TOKEN")


def _default_order_poll_interval() -> float:
    raw = os.environ.get("FORGE_ORDER_POLL_INTERVAL", "5")
    try:
        return float(raw)
    except ValueError:
        # argparse still accepts an explicit valid --poll-interval; the worker
        # itself rejects non-positive values with a clear error.
        return 5.0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="forge.py",
        description="Generate SD card art and ingest it into the game API.",
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("doctor", help="Run environment/hardware diagnostics")

    batch_parser = subparsers.add_parser("batch", help="Generate card art from a recipe file")
    batch_parser.add_argument(
        "--config",
        type=Path,
        default=CARD_FORGE_DIR / "recipes.yaml",
        help="Path to recipes.yaml (default: recipes.yaml next to forge.py)",
    )
    batch_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap total images generated this run",
    )
    batch_parser.add_argument(
        "--recipe",
        type=str,
        default=None,
        help="Generate only the recipe with this id",
    )
    batch_parser.add_argument(
        "--storage-dir",
        type=Path,
        default=_default_storage_dir(),
        help="Directory to store generated images (default: FORGE_STORAGE_DIR or ../storage)",
    )
    batch_parser.add_argument(
        "--manifest",
        type=Path,
        default=CARD_FORGE_DIR / "manifest.json",
        help="Path to manifest.json (default: manifest.json next to forge.py)",
    )
    batch_parser.add_argument(
        "--model-id",
        type=str,
        default=_default_model_id(),
        help="Diffusers model id (default: FORGE_MODEL_ID or Lykon/dreamshaper-8)",
    )
    batch_parser.add_argument(
        "--attention-slicing",
        action="store_true",
        help="only enable in response to a real OOM; costs 20-30%% speed",
    )
    batch_parser.add_argument(
        "--cpu-offload",
        action="store_true",
        help="last resort; 3-5x slower",
    )
    batch_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Plan only, no model load",
    )

    cases_parser = subparsers.add_parser("cases", help="Generate/promote case (loot box) container art")
    cases_sub = cases_parser.add_subparsers(dest="cases_action")

    cases_gen = cases_sub.add_parser("generate", help="Generate candidate case art")
    cases_gen.add_argument(
        "--config",
        type=Path,
        default=CARD_FORGE_DIR / "case_recipes.yaml",
        help="Path to case_recipes.yaml (default: case_recipes.yaml next to forge.py)",
    )
    cases_gen.add_argument("--storage-dir", type=Path, default=_default_storage_dir())
    cases_gen.add_argument("--log", type=Path, default=CARD_FORGE_DIR / "case_gen_log.json")
    cases_gen.add_argument("--model-id", type=str, default=_default_model_id())
    cases_gen.add_argument("--case", type=str, default=None, help="Generate only this case slug")
    cases_gen.add_argument("--attention-slicing", action="store_true")
    cases_gen.add_argument("--cpu-offload", action="store_true")
    cases_gen.add_argument("--dry-run", action="store_true")

    cases_promote = cases_sub.add_parser("promote", help="Copy a reviewed candidate to storage/cases/<slug>.png")
    cases_promote.add_argument("--case", type=str, required=True, help="Case slug")
    cases_promote.add_argument("--seed", type=int, required=True, help="Seed of the chosen candidate")
    cases_promote.add_argument("--storage-dir", type=Path, default=_default_storage_dir())
    cases_promote.add_argument("--log", type=Path, default=CARD_FORGE_DIR / "case_gen_log.json")

    ingest_parser = subparsers.add_parser("ingest", help="Push a manifest of generated images into the game API")
    ingest_parser.add_argument(
        "--manifest",
        type=Path,
        default=CARD_FORGE_DIR / "manifest.json",
        help="Path to manifest.json (default: manifest.json next to forge.py)",
    )

    order_parser = subparsers.add_parser("order", help="Run one server-authored card generation order")
    order_sub = order_parser.add_subparsers(dest="order_action")
    order_run = order_sub.add_parser("run", help="Claim, generate and submit one order")
    order_run.add_argument("--id", required=True, help="Generation order UUID")
    order_run.add_argument("--api-url", default=_default_api_url())
    order_run.add_argument("--storage-dir", type=Path, default=_default_storage_dir())
    order_run.add_argument("--model-id", default=_default_model_id())
    order_run.add_argument("--config", type=Path, default=CARD_FORGE_DIR / "recipes.yaml")
    order_run.add_argument("--attention-slicing", action="store_true")
    order_run.add_argument("--cpu-offload", action="store_true")
    order_run.add_argument("--dry-run", action="store_true")
    order_worker = order_sub.add_parser("worker", help="Continuously lease and generate ready orders")
    order_worker.add_argument("--api-url", default=_default_api_url())
    order_worker.add_argument("--storage-dir", type=Path, default=_default_storage_dir())
    order_worker.add_argument("--model-id", default=_default_model_id())
    order_worker.add_argument("--config", type=Path, default=CARD_FORGE_DIR / "recipes.yaml")
    order_worker.add_argument(
        "--poll-interval", type=float,
        default=_default_order_poll_interval(),
        help="Seconds to wait after an empty queue or transient API error (default: FORGE_ORDER_POLL_INTERVAL or 5)",
    )
    order_worker.add_argument("--attention-slicing", action="store_true")
    order_worker.add_argument("--cpu-offload", action="store_true")
    order_worker.add_argument(
        "--once", action="store_true",
        help="Claim and process at most one order, then exit (useful for diagnostics)",
    )
    ingest_parser.add_argument(
        "--api-url",
        type=str,
        default=_default_api_url(),
        help="Game API base URL (default: FORGE_API_URL or http://localhost:3000/api)",
    )
    ingest_parser.add_argument(
        "--chunk-size",
        type=int,
        default=25,
        help="Number of records to send per request (default: 25)",
    )
    ingest_parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request timeout in seconds (default: 30.0)",
    )

    return parser


def _run_doctor(_args: argparse.Namespace) -> int:
    import device

    return device.doctor()


def _run_batch(args: argparse.Namespace) -> int:
    import batch  # lazy import: keeps `forge.py doctor` working even if diffusers is broken

    return batch.run_batch(
        recipes_path=args.config,
        storage_dir=args.storage_dir,
        manifest_path=args.manifest,
        model_id=args.model_id,
        limit=args.limit,
        recipe_filter=args.recipe,
        attention_slicing=args.attention_slicing,
        cpu_offload=args.cpu_offload,
        dry_run=args.dry_run,
    )


def _run_cases(args: argparse.Namespace) -> int:
    import cases  # lazy import, see note in _run_batch

    if args.cases_action == "generate":
        return cases.run_cases_generate(
            recipes_path=args.config,
            storage_dir=args.storage_dir,
            log_path=args.log,
            model_id=args.model_id,
            case_filter=args.case,
            attention_slicing=args.attention_slicing,
            cpu_offload=args.cpu_offload,
            dry_run=args.dry_run,
        )
    elif args.cases_action == "promote":
        return cases.run_case_promote(
            slug=args.case,
            seed=args.seed,
            storage_dir=args.storage_dir,
            log_path=args.log,
        )
    else:
        print("ERROR: specify 'generate' or 'promote' (forge.py cases generate|promote)")
        return 2


def _run_ingest(args: argparse.Namespace) -> int:
    import ingest  # lazy import, see note in _run_batch

    service_token = _default_service_token()
    if not service_token:
        print("ERROR: FORGE_SERVICE_TOKEN is not set.")
        print("       game-api's ingest endpoint requires it (X-Service-Token header) and will reject this request.")
        print("       Set FORGE_SERVICE_TOKEN in the environment or in .env to the same value as game-api's FORGE_SERVICE_TOKEN.")
        return 1

    return ingest.run_ingest(
        manifest_path=args.manifest,
        api_url=args.api_url,
        service_token=service_token,
        chunk_size=args.chunk_size,
        timeout=args.timeout,
    )


def _run_order(args: argparse.Namespace) -> int:
    if args.order_action not in ("run", "worker"):
        print("ERROR: specify 'run' or 'worker'")
        return 2
    service_token = _default_service_token()
    if not service_token:
        print("ERROR: FORGE_SERVICE_TOKEN is not set.")
        return 1
    import orders
    if args.order_action == "worker":
        return orders.run_worker(
            api_url=args.api_url, service_token=service_token,
            storage_dir=args.storage_dir, model_id=args.model_id, recipes_path=args.config,
            poll_interval=args.poll_interval, attention_slicing=args.attention_slicing,
            cpu_offload=args.cpu_offload, once=args.once,
        )
    if args.dry_run:
        print("ERROR: order run --dry-run is not supported because claiming an order changes its durable state.")
        return 2
    return orders.run_order(
        order_id=args.id, api_url=args.api_url, service_token=service_token,
        storage_dir=args.storage_dir, model_id=args.model_id, recipes_path=args.config,
        attention_slicing=args.attention_slicing, cpu_offload=args.cpu_offload, dry_run=False,
    )


def main(argv: list[str] | None = None) -> int:
    _load_dotenv_files()

    parser = _build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        return 2

    handlers = {
        "doctor": _run_doctor,
        "batch": _run_batch,
        "cases": _run_cases,
        "ingest": _run_ingest,
        "order": _run_order,
    }

    try:
        return handlers[args.command](args)
    except KeyboardInterrupt:
        print("\ninterrupted")
        return 130


if __name__ == "__main__":
    sys.exit(main())
