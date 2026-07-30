"""Parsing and validation for recipes.yaml.

recipes.yaml is owned by someone else; this module only reads it. It
assembles the final prompt string per-recipe (style-first, so 110 images
still read as one collection) and validates the recipe set eagerly so a
seed collision or a bad enum value fails at load time instead of silently
overwriting files halfway through a batch.
"""

from __future__ import annotations

import os
import re
import warnings
from dataclasses import dataclass
from pathlib import Path

ARCHETYPES = (
    "beast", "humanoid", "undead", "construct", "spirit",
    "dragon", "slime", "sword", "potion", "crystal",
)
ELEMENTS = ("fire", "water", "earth", "air", "shadow", "light")
RARITIES = ("common", "uncommon", "rare", "epic", "legendary", "mythic")

# `sword`, `potion`, `crystal` are OBJECTS, not creatures - they get a second
# STYLE fragment (recipes.yaml's `object_style`) instead of the creature one,
# because "creature concept art" + "centered character portrait" reliably pushes
# object archetypes toward anthropomorphic junk (sword-people, potion-faces).
# Measured: with the creature STYLE, 0/9 sword/potion/crystal test draws across
# 3 style-candidate rounds were clean objects (they all held/wore the item as a
# character). Swapping to `object_style` ("fantasy still life illustration,
# single item centered, ...") got 9/9 clean object shots, no figures. Mirrors
# packages/shared-types/src/card.ts's own comment that these three "are objects,
# not creatures".
OBJECT_ARCHETYPES = ("sword", "potion", "crystal")

# Mirrors ARCHETYPE_RARITIES in packages/shared-types/src/card.ts (that file is
# the authority; this is read-only duplication for early validation, the same
# pattern manifest_models.py already uses for the Archetype/Element Literals).
# Catches a mis-tagged recipe (e.g. a dragon recipe accidentally marked
# "common") at load time instead of after generating a full batch.
_ALL_RARITIES = RARITIES
ARCHETYPE_RARITIES: dict[str, tuple[str, ...]] = {
    "beast": _ALL_RARITIES,
    "humanoid": _ALL_RARITIES,
    "undead": _ALL_RARITIES,
    "construct": _ALL_RARITIES,
    "spirit": _ALL_RARITIES,
    "dragon": ("legendary", "mythic"),
    "slime": _ALL_RARITIES,
    "sword": ("common", "uncommon"),
    "potion": ("common",),
    "crystal": ("uncommon", "rare"),
}

# CLIP's hard limit. Anything past this is dropped from the END of the prompt,
# silently, with no error - so it must be caught here rather than in the output.
CLIP_TOKEN_LIMIT = 77
_WHITESPACE_RE = re.compile(r"\s+")
_TOKEN_RE = re.compile(r"[\w']+|[^\w\s]")

# Calibration measured against the real CLIP tokenizer over all 34 shipped recipes:
# real/regex ratio ranged 1.087-1.182 (mean 1.134). 1.2 keeps the cheap fallback
# conservative, so it over-estimates rather than waving through a truncated prompt.
_HEURISTIC_SAFETY_FACTOR = 1.2

_clip_tokenizer_cache: list = []  # [] = not tried yet, [None] = unavailable, [tok] = ready


@dataclass(frozen=True)
class Recipe:
    id: str
    archetype: str
    element: str | None
    rarity: str
    count: int
    base_seed: int
    cfg_scale: float
    steps: int
    prompt: str  # fully assembled


@dataclass(frozen=True)
class RarityProfile:
    """Reusable generation controls for every order at one rarity."""

    fragment: str
    cfg_scale: float
    steps: int


@dataclass(frozen=True)
class RecipeSet:
    style: str
    quality: str
    negative: str
    recipes: list[Recipe]
    order_style: str | None = None
    order_quality: str | None = None
    object_style: str | None = None
    archetype_fragments: dict[str, str] | None = None
    element_fragments: dict[str, str] | None = None
    object_element_fragments: dict[str, str] | None = None
    rarity_profiles: dict[str, RarityProfile] | None = None

    def total_count(self) -> int:
        return sum(r.count for r in self.recipes)

    def by_rarity(self) -> dict[str, int]:
        totals: dict[str, int] = {}
        for r in self.recipes:
            totals[r.rarity] = totals.get(r.rarity, 0) + r.count
        return totals

    def order_profile(
        self, archetype: str, element: str | None, rarity: str, brief: str,
    ) -> tuple[str, str, int, float]:
        """Compose a server order from shared profiles, not a batch recipe.

        Batch recipes intentionally cover only a curated subset of combinations.
        Admin orders may use any valid archetype/element/rarity combination, so
        their prompt and sampler settings must be derived from the top-level
        profile tables instead of looking up a matching recipe row.
        """
        if archetype not in ARCHETYPES:
            raise ValueError(f"Unknown order archetype '{archetype}'")
        if rarity not in RARITIES:
            raise ValueError(f"Unknown order rarity '{rarity}'")
        allowed = ARCHETYPE_RARITIES[archetype]
        if rarity not in allowed:
            raise ValueError(
                f"Rarity '{rarity}' is not allowed for '{archetype}' "
                f"(allowed: {', '.join(allowed)})"
            )
        if element is not None and element not in ELEMENTS:
            raise ValueError(f"Unknown order element '{element}'")

        rarities = self.rarity_profiles or {}
        rarity_profile = rarities.get(rarity)
        if rarity_profile is None:
            raise ValueError("recipes.yaml is missing the profile needed for this order")

        normalized_brief = _clean(brief)
        if not normalized_brief:
            raise ValueError("Order brief must not be empty")
        order_style = self.order_style or self.style
        order_quality = self.order_quality or self.quality
        # The administrator's brief is the primary creative direction. Order
        # prompts therefore use compact classifier tags rather than the long
        # batch recipe fragments, which are tuned for catalogue coverage.
        tags = [f"{archetype} subject", f"{element} magic" if element else None, f"{rarity} rarity"]

        def compose(candidate_brief: str) -> str:
            return ", ".join(fragment for fragment in (order_style, candidate_brief, *tags, order_quality) if fragment)

        words = normalized_brief.split(" ")
        prompt = compose(" ".join(words))
        token_count, exact = clip_token_count(prompt)
        while token_count > CLIP_TOKEN_LIMIT and words:
            words.pop()
            prompt = compose(" ".join(words))
            token_count, exact = clip_token_count(prompt)
        if not words:
            precision = "exact" if exact else "estimated"
            raise ValueError(f"Order scaffold is {token_count}/{CLIP_TOKEN_LIMIT} CLIP tokens ({precision}); simplify its profile")
        if len(words) < len(normalized_brief.split(" ")):
            print(f"WARN: order brief trimmed to {len(words)} words to fit CLIP's {CLIP_TOKEN_LIMIT}-token limit")
        return prompt, self.negative, rarity_profile.steps, rarity_profile.cfg_scale


def _clean(text: str) -> str:
    """Collapse internal newlines/whitespace runs to single spaces and strip."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def assemble_prompt(
    style: str,
    archetype_frag: str,
    element_frag: str | None,
    rarity_frag: str,
    quality: str,
    extra: str | None = None,
) -> str:
    """[STYLE], [ARCHETYPE], [ELEMENT], [RARITY MODIFIER], [QUALITY], [extra].

    STYLE goes first because tokens early in the prompt dominate generation,
    and a single shared STYLE fragment across the whole set is what makes
    110 separately-generated images read as one collection.
    """
    fragments = [style, archetype_frag]
    if element_frag:
        fragments.append(element_frag)
    fragments.append(rarity_frag)
    fragments.append(quality)
    if extra:
        fragments.append(extra)

    cleaned = [_clean(f) for f in fragments if f is not None and _clean(f)]
    prompt = ", ".join(cleaned)
    prompt = prompt.rstrip(", ").rstrip(",")
    return prompt


def _get_clip_tokenizer():
    """Best-effort local CLIP tokenizer. Never downloads, never touches the GPU.

    A tokenizer is a vocab file, not a model: loading it costs no VRAM and does
    not pull in the UNet or VAE. Returns None if transformers is missing or the
    tokenizer is not already in the local HF cache.
    """
    if _clip_tokenizer_cache:
        return _clip_tokenizer_cache[0]

    tokenizer = None
    try:
        from transformers import CLIPTokenizer

        model_id = os.environ.get("FORGE_MODEL_ID", "Lykon/dreamshaper-8")
        tokenizer = CLIPTokenizer.from_pretrained(
            model_id, subfolder="tokenizer", local_files_only=True
        )
    except Exception:
        tokenizer = None

    _clip_tokenizer_cache.append(tokenizer)
    return tokenizer


def clip_token_count(prompt: str) -> tuple[int, bool]:
    """Return (token_count, is_exact) including CLIP's BOS/EOS pair.

    Uses the real CLIP tokenizer when it is already cached locally; otherwise
    falls back to a deliberately conservative regex estimate. The regex alone
    under-counts badly (it scored the longest shipped recipe at 72 when the real
    tokenizer said 80) because CLIP splits unusual words into several subword
    tokens - "artstation" and "awe-inspiring" cost far more than one each.
    """
    tokenizer = _get_clip_tokenizer()
    if tokenizer is not None:
        import warnings as _warnings

        with _warnings.catch_warnings():
            # The tokenizer itself warns on overlong input; we report that ourselves.
            _warnings.simplefilter("ignore")
            return len(tokenizer(prompt)["input_ids"]), True

    raw = len(_TOKEN_RE.findall(prompt))
    return int(raw * _HEURISTIC_SAFETY_FACTOR) + 2, False


def approx_token_count(prompt: str) -> int:
    """CLIP token count for a prompt, exact when the tokenizer is available."""
    return clip_token_count(prompt)[0]


def _require_mapping(value, what: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"recipes.yaml: '{what}' must be a mapping")
    return value


def load_recipes(path: str | Path) -> RecipeSet:
    import yaml

    path = Path(path)
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)

    if not isinstance(data, dict):
        raise ValueError(f"recipes.yaml: top-level document must be a mapping ({path})")

    style = data.get("style")
    quality = data.get("quality")
    negative = data.get("negative")
    if not isinstance(style, str) or not style.strip():
        raise ValueError("recipes.yaml: 'style' must be a non-empty string")
    if not isinstance(quality, str) or not quality.strip():
        raise ValueError("recipes.yaml: 'quality' must be a non-empty string")
    if not isinstance(negative, str) or not negative.strip():
        raise ValueError("recipes.yaml: 'negative' must be a non-empty string")

    style = _clean(style)
    quality = _clean(quality)
    negative = _clean(negative)
    order_style_raw = data.get("order_style")
    order_quality_raw = data.get("order_quality")
    if not isinstance(order_style_raw, str) or not order_style_raw.strip():
        raise ValueError("recipes.yaml: 'order_style' must be a non-empty string")
    if not isinstance(order_quality_raw, str) or not order_quality_raw.strip():
        raise ValueError("recipes.yaml: 'order_quality' must be a non-empty string")
    order_style = _clean(order_style_raw)
    order_quality = _clean(order_quality_raw)

    # Optional: only required if a recipe actually uses an OBJECT_ARCHETYPES
    # archetype (checked per-recipe below, not here, so the 34 original
    # creature recipes keep working on a recipes.yaml with no object_style at all).
    object_style_raw = data.get("object_style")
    object_style = _clean(object_style_raw) if isinstance(object_style_raw, str) and object_style_raw.strip() else None

    archetypes = _require_mapping(data.get("archetypes", {}), "archetypes")
    elements = _require_mapping(data.get("elements", {}), "elements")
    # Optional: only required if a recipe actually uses an OBJECT_ARCHETYPES
    # archetype with a non-null element (checked per-recipe below). Kept
    # separate from `elements` on purpose - see recipes.yaml's comment: an
    # environmental fragment ("storm clouds") that is harmless on a creature
    # composes a scene (and a figure to stand in it) on an object.
    object_elements = data.get("object_elements", {})
    if object_elements and not isinstance(object_elements, dict):
        raise ValueError("recipes.yaml: 'object_elements' must be a mapping")
    rarities = _require_mapping(data.get("rarities", {}), "rarities")

    # These tables are also the source for server-authored generation orders.
    # Validate all entries up front, rather than making an otherwise valid
    # order depend on whether a matching batch recipe happens to exist.
    archetype_fragments: dict[str, str] = {}
    element_fragments: dict[str, str] = {}
    object_element_fragments: dict[str, str] = {}
    rarity_profiles: dict[str, RarityProfile] = {}
    for archetype_name in ARCHETYPES:
        fragment = archetypes.get(archetype_name)
        if not isinstance(fragment, str) or not fragment.strip():
            raise ValueError(f"recipes.yaml: archetypes missing entry for '{archetype_name}'")
        archetype_fragments[archetype_name] = _clean(fragment)
    for element_name in ELEMENTS:
        fragment = elements.get(element_name)
        if not isinstance(fragment, str) or not fragment.strip():
            raise ValueError(f"recipes.yaml: elements missing entry for '{element_name}'")
        element_fragments[element_name] = _clean(fragment)
        object_fragment = object_elements.get(element_name)
        if not isinstance(object_fragment, str) or not object_fragment.strip():
            raise ValueError(f"recipes.yaml: object_elements missing entry for '{element_name}'")
        object_element_fragments[element_name] = _clean(object_fragment)
    for rarity_name in RARITIES:
        rarity_entry = rarities.get(rarity_name)
        if not isinstance(rarity_entry, dict):
            raise ValueError(f"recipes.yaml: rarities table missing entry for '{rarity_name}'")
        fragment = rarity_entry.get("fragment")
        cfg_scale = rarity_entry.get("cfg_scale")
        steps = rarity_entry.get("steps")
        if not isinstance(fragment, str) or not fragment.strip():
            raise ValueError(f"recipes.yaml: rarities['{rarity_name}'] missing 'fragment'")
        if cfg_scale is None or steps is None:
            raise ValueError(f"recipes.yaml: rarities['{rarity_name}'] needs cfg_scale and steps")
        rarity_profiles[rarity_name] = RarityProfile(_clean(fragment), float(cfg_scale), int(steps))

    raw_recipes = data.get("recipes")
    if not isinstance(raw_recipes, list) or not raw_recipes:
        raise ValueError("recipes.yaml: 'recipes' must be a non-empty list")

    seen_ids: set[str] = set()
    seed_ranges: list[tuple[str, int, int]] = []  # (id, start, end_inclusive)
    recipes: list[Recipe] = []

    for raw in raw_recipes:
        if not isinstance(raw, dict):
            raise ValueError(f"recipes.yaml: recipe entries must be mappings, got {raw!r}")

        rid = raw.get("id")
        if not isinstance(rid, str) or not rid.strip():
            raise ValueError(f"recipes.yaml: recipe missing a valid 'id' ({raw!r})")

        if rid in seen_ids:
            raise ValueError(f"recipes.yaml: duplicate recipe id '{rid}'")
        seen_ids.add(rid)

        archetype = raw.get("archetype")
        if archetype not in ARCHETYPES:
            raise ValueError(
                f"recipes.yaml: recipe '{rid}' has invalid archetype "
                f"'{archetype}' (must be one of {', '.join(ARCHETYPES)})"
            )

        element = raw.get("element")
        if element is not None and element not in ELEMENTS:
            raise ValueError(
                f"recipes.yaml: recipe '{rid}' has invalid element "
                f"'{element}' (must be one of {', '.join(ELEMENTS)} or null)"
            )

        rarity = raw.get("rarity")
        if rarity not in RARITIES:
            raise ValueError(
                f"recipes.yaml: recipe '{rid}' has invalid rarity "
                f"'{rarity}' (must be one of {', '.join(RARITIES)})"
            )

        allowed_rarities = ARCHETYPE_RARITIES.get(archetype, RARITIES)
        if rarity not in allowed_rarities:
            raise ValueError(
                f"recipes.yaml: recipe '{rid}' pairs archetype '{archetype}' with rarity "
                f"'{rarity}', but that archetype is only allowed at "
                f"{', '.join(allowed_rarities)} (see ARCHETYPE_RARITIES in "
                f"packages/shared-types/src/card.ts)"
            )

        count = raw.get("count")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError(f"recipes.yaml: recipe '{rid}' has invalid count '{count}' (must be >= 1)")

        base_seed = raw.get("base_seed")
        if not isinstance(base_seed, int) or isinstance(base_seed, bool) or base_seed < 0:
            raise ValueError(
                f"recipes.yaml: recipe '{rid}' has invalid base_seed '{base_seed}' (must be >= 0)"
            )

        rarity_entry = rarities.get(rarity)
        if not isinstance(rarity_entry, dict):
            raise ValueError(f"recipes.yaml: rarities table missing entry for '{rarity}' (used by '{rid}')")

        cfg_scale = raw.get("cfg_scale", rarity_entry.get("cfg_scale"))
        steps = raw.get("steps", rarity_entry.get("steps"))
        if cfg_scale is None:
            raise ValueError(f"recipes.yaml: recipe '{rid}' has no cfg_scale (recipe or rarities['{rarity}'])")
        if steps is None:
            raise ValueError(f"recipes.yaml: recipe '{rid}' has no steps (recipe or rarities['{rarity}'])")
        cfg_scale = float(cfg_scale)
        steps = int(steps)

        prompt_override = raw.get("prompt")
        if isinstance(prompt_override, str) and prompt_override.strip():
            prompt = _clean(prompt_override)
        else:
            archetype_frag = archetypes.get(archetype)
            if not isinstance(archetype_frag, str) or not archetype_frag.strip():
                raise ValueError(f"recipes.yaml: archetypes missing entry for '{archetype}' (used by '{rid}')")

            element_frag = None
            if element is not None:
                if archetype in OBJECT_ARCHETYPES:
                    # Object archetypes get the surface/effect wording, not the
                    # creature scene wording - see recipes.yaml's object_elements
                    # comment (the sword-air incident).
                    element_frag = object_elements.get(element)
                    if not isinstance(element_frag, str) or not element_frag.strip():
                        raise ValueError(
                            f"recipes.yaml: object_elements missing entry for '{element}' (used by '{rid}')"
                        )
                else:
                    element_frag = elements.get(element)
                    if not isinstance(element_frag, str) or not element_frag.strip():
                        raise ValueError(f"recipes.yaml: elements missing entry for '{element}' (used by '{rid}')")

            rarity_frag = rarity_entry.get("fragment")
            if not isinstance(rarity_frag, str) or not rarity_frag.strip():
                raise ValueError(f"recipes.yaml: rarities['{rarity}'] missing 'fragment' (used by '{rid}')")

            extra = raw.get("extra")
            if extra is not None and not isinstance(extra, str):
                raise ValueError(f"recipes.yaml: recipe '{rid}' has non-string 'extra'")

            if archetype in OBJECT_ARCHETYPES:
                if object_style is None:
                    raise ValueError(
                        f"recipes.yaml: recipe '{rid}' uses object archetype '{archetype}' "
                        f"but no top-level 'object_style' is defined"
                    )
                effective_style = object_style
            else:
                effective_style = style

            prompt = assemble_prompt(effective_style, archetype_frag, element_frag, rarity_frag, quality, extra)

        recipe = Recipe(
            id=rid,
            archetype=archetype,
            element=element,
            rarity=rarity,
            count=count,
            base_seed=base_seed,
            cfg_scale=cfg_scale,
            steps=steps,
            prompt=prompt,
        )

        token_count, exact = clip_token_count(prompt)
        if token_count > CLIP_TOKEN_LIMIT:
            qualifier = "" if exact else " (estimated - CLIP tokenizer not cached locally)"
            msg = (
                f"WARN: recipe '{rid}' prompt is {token_count} tokens{qualifier}, over CLIP's "
                f"limit of {CLIP_TOKEN_LIMIT}. The tail will be dropped SILENTLY - shorten "
                f"the rarity fragment or the quality tail in recipes.yaml."
            )
            warnings.warn(msg)
            print(msg)

        seed_ranges.append((rid, base_seed, base_seed + count - 1))
        recipes.append(recipe)

    # Seed-range overlap check across all recipes: a real collision would
    # silently overwrite files on disk, so catch it here instead.
    seed_ranges.sort(key=lambda t: t[1])
    for i in range(1, len(seed_ranges)):
        prev_id, prev_start, prev_end = seed_ranges[i - 1]
        cur_id, cur_start, cur_end = seed_ranges[i]
        if cur_start <= prev_end:
            raise ValueError(
                f"recipes.yaml: seed range overlap between '{prev_id}' "
                f"[{prev_start}, {prev_end}] and '{cur_id}' [{cur_start}, {cur_end}]"
            )

    return RecipeSet(
        style=style,
        quality=quality,
        negative=negative,
        recipes=recipes,
        order_style=order_style,
        order_quality=order_quality,
        object_style=object_style,
        archetype_fragments=archetype_fragments,
        element_fragments=element_fragments,
        object_element_fragments=object_element_fragments,
        rarity_profiles=rarity_profiles,
    )
