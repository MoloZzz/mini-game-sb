# Card forge

`card-forge` is an offline Python Stable Diffusion 1.5 batch pipeline, not a runtime service. It makes 512×512 artwork only; frame, name, stats, and flavor text are rendered by the UI. Never put a model call on the player request path.

## Flow and boundaries

`recipes.yaml` → `forge.py batch` → `storage/cards/*.png` + `storage/thumbs/*.webp` + `card-forge/manifest.json` → `forge.py ingest` → `POST /api/admin/cards/ingest` → card `draft` → admin review → `approved` pool.

Ingest is idempotent by card slug. It requires `FORGE_SERVICE_TOKEN` and sends it as `X-Service-Token`; game-api accepts that token or an admin JWT only. It is safe to rerun an interrupted batch or ingest: completed image pairs are skipped and known slugs are not inserted again.

Admin generation orders use `forge.py order run --id <uuid>`: the CLI claims a ready order, generates its fixed-seed candidates offline, and submits them as drafts for review.

## Hardware constraints

Target hardware is a 4 GB RTX 3050 Laptop GPU. Keep generation at 512×512, fp16, batch size 1, with one pipeline resident. `forge.py doctor` must pass before a real batch. Start with `--dry-run` or a small recipe batch; use attention slicing or CPU offload only after a real OOM because each slows generation.

## Contract and sources

The manifest schema must exactly match `IngestCardInput` and `GenMeta` in `packages/shared-types/src/`. Change both together and validate with the forge models/tests. Main files: `card-forge/forge.py`, `card-forge/recipes.py`, `card-forge/pipeline.py`, `card-forge/ingest.py`, and `card-forge/manifest_models.py`. Operational detail is in `card-forge/README.md`.
