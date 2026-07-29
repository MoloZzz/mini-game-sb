"""Posts the local manifest to game-api's admin ingest endpoint.

Idempotent by slug (enforced server-side): re-running after a partial or
already-completed ingest is expected and safe. game-api is expected to be
down most of the time during card-forge development, so the connection
error path must print a clear, non-scary message instead of a traceback.
"""

from __future__ import annotations

from pathlib import Path

from manifest_models import IngestCardInput, load_manifest


def _dedupe_by_slug(cards: list[IngestCardInput]) -> list[IngestCardInput]:
    """Keep the last occurrence of each slug, preserving first-seen order."""
    by_slug: dict[str, IngestCardInput] = {}
    order: list[str] = []
    for card in cards:
        if card.slug not in by_slug:
            order.append(card.slug)
        by_slug[card.slug] = card
    return [by_slug[slug] for slug in order]


def _chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def run_ingest(
    manifest_path: Path,
    api_url: str,
    service_token: str,
    chunk_size: int = 25,
    timeout: float = 30.0,
) -> int:
    import requests

    manifest_path = Path(manifest_path)

    try:
        cards = load_manifest(manifest_path)
    except ValueError as exc:
        print(f"ERROR: manifest validation failed: {exc}")
        return 1

    if not cards:
        print(f"Nothing to ingest: manifest '{manifest_path}' is empty or missing.")
        print("inserted=0 skipped=0")
        return 0

    cards = _dedupe_by_slug(cards)

    api_url = api_url.rstrip("/")
    endpoint = f"{api_url}/admin/cards/ingest"
    headers = {"X-Service-Token": service_token}

    total_inserted = 0
    total_skipped = 0
    all_skipped_slugs: list[str] = []

    for chunk in _chunked(cards, chunk_size):
        payload = {"cards": [c.model_dump(mode="json") for c in chunk]}

        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
        except requests.exceptions.ConnectionError:
            print(f"ERROR: cannot reach game-api at {api_url}")
            print("       POST /admin/cards/ingest failed: connection refused.")
            print("       This is expected if game-api is not running yet.")
            print("       The batch output is already on disk; re-run ingest later - it is idempotent.")
            return 2
        except requests.exceptions.Timeout:
            print(f"ERROR: request to {endpoint} timed out after {timeout}s.")
            print("       The batch output is already on disk; re-run ingest later - it is idempotent.")
            return 2

        if response.status_code in (401, 403):
            print(f"ERROR: game-api rejected the request with status {response.status_code} for {endpoint}")
            print("       The X-Service-Token header was missing or did not match.")
            print("       Set FORGE_SERVICE_TOKEN to the same value as game-api's FORGE_SERVICE_TOKEN env var.")
            return 1

        if not (200 <= response.status_code < 300):
            body = response.text[:500]
            print(f"ERROR: game-api returned status {response.status_code} for {endpoint}")
            print(f"       response body: {body}")
            return 1

        try:
            data = response.json()
        except ValueError:
            print(f"ERROR: game-api returned a non-JSON response from {endpoint}")
            print(f"       response body: {response.text[:500]}")
            return 1

        inserted = data.get("inserted", 0)
        skipped = data.get("skipped", 0)
        skipped_slugs = data.get("skippedSlugs", [])

        total_inserted += inserted
        total_skipped += skipped
        all_skipped_slugs.extend(skipped_slugs)

    distinct_skipped = len(set(all_skipped_slugs))

    print(f"inserted={total_inserted} skipped={total_skipped}")
    print(f"distinct skipped slugs: {distinct_skipped}")
    if total_inserted == 0 and total_skipped > 0:
        print("inserted=0: all cards in this manifest were already ingested (expected on a re-run - ingest is idempotent).")

    return 0
