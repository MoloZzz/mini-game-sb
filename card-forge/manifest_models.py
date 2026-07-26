"""pydantic v2 models mirroring packages/shared-types/src/{card.ts,api.ts}.

Field names are camelCase to match the TypeScript contract exactly (the TS
file is the authority) - this is what makes the manifest directly postable
to game-api's ingest endpoint without any key renaming.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

Rarity = Literal["common", "uncommon", "rare", "epic", "legendary", "mythic"]
Archetype = Literal["beast", "humanoid", "undead", "construct", "spirit"]
Element = Literal["fire", "water", "earth", "air", "shadow", "light"]


class GenMeta(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str
    prompt: str
    negativePrompt: str
    seed: int
    steps: int
    cfgScale: float
    sampler: str
    width: int
    height: int
    recipeId: str
    generatedAt: str  # ISO-8601


class IngestCardInput(BaseModel):
    slug: str
    imagePath: str
    thumbPath: str
    suggestedRarity: Rarity
    archetype: Archetype
    element: Element | None
    genMeta: GenMeta


class IngestRequest(BaseModel):
    cards: list[IngestCardInput]


class IngestResponse(BaseModel):
    inserted: int
    skipped: int
    skippedSlugs: list[str]


def load_manifest(path: Path) -> list[IngestCardInput]:
    """Load the manifest. Returns [] if the file does not exist yet."""
    path = Path(path)
    if not path.exists():
        return []

    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"manifest '{path}': could not read file ({exc})") from exc

    try:
        raw = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"manifest '{path}': malformed JSON ({exc})") from exc

    if not isinstance(raw, list):
        raise ValueError(f"manifest '{path}': expected a JSON array of cards, got {type(raw).__name__}")

    cards: list[IngestCardInput] = []
    for i, item in enumerate(raw):
        try:
            cards.append(IngestCardInput.model_validate(item))
        except Exception as exc:
            slug = item.get("slug", "<unknown>") if isinstance(item, dict) else "<unknown>"
            raise ValueError(f"manifest '{path}': entry {i} (slug={slug!r}) failed validation: {exc}") from exc

    return cards


def save_manifest(path: Path, cards: list[IngestCardInput]) -> None:
    """Write the manifest as JSON, indent=2, sorted by slug, utf-8, trailing newline."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    sorted_cards = sorted(cards, key=lambda c: c.slug)
    payload = [c.model_dump(mode="json") for c in sorted_cards]

    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")


def merge_manifest(
    existing: list[IngestCardInput],
    new: list[IngestCardInput],
) -> list[IngestCardInput]:
    """Dedupe by slug, new wins, keeps order stable (existing order, new appended at end for new slugs)."""
    by_slug: dict[str, IngestCardInput] = {c.slug: c for c in existing}
    order: list[str] = [c.slug for c in existing]

    for card in new:
        if card.slug not in by_slug:
            order.append(card.slug)
        by_slug[card.slug] = card

    return [by_slug[slug] for slug in order]
