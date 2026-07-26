import { useState } from 'react';
import {
  ARCHETYPES,
  ELEMENTS,
  RARITIES,
  RARITY_META,
  type AdminCardDto,
  type Archetype,
  type Element,
  type Rarity,
  type ReviewCardRequest,
} from '@card-game/shared-types';

import { ImgWithFallback } from './ImgWithFallback';
import { autofillStatForRarity, checkStatRange } from './statValidation';

/** Sentinel <option> value standing in for `element: null` — `null` itself
 * can't be a <select> option value. */
const NONE_ELEMENT_VALUE = '__none__';

export interface CardReviewPanelProps {
  card: AdminCardDto | null;
  edits: ReviewCardRequest;
  onEditField: <K extends keyof ReviewCardRequest>(field: K, value: ReviewCardRequest[K]) => void;
  onApprove: () => void;
  onReject: () => void;
  /** True while this card's PATCH is in flight — disables Approve/Reject so a second click can't fire a duplicate review. */
  pending: boolean;
  genMetaOpen: boolean;
  onGenMetaOpenChange: (open: boolean) => void;
}

async function copyToClipboard(text: string): Promise<void> {
  // navigator.clipboard is absent under jsdom and on insecure origins —
  // failing silently beats throwing over what is just a convenience button.
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // ignored
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void copyToClipboard(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      aria-label={label}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * The detail editor for the focused card. Prompt and seed are rendered above
 * the collapsible generation block, never inside it — judging which recipes
 * are working (card-game-data 10, ADR-013: review, not generation, is the
 * bottleneck) is impossible if seeing them costs a click.
 */
export function CardReviewPanel({
  card,
  edits,
  onEditField,
  onApprove,
  onReject,
  pending,
  genMetaOpen,
  onGenMetaOpenChange,
}: CardReviewPanelProps) {
  if (!card) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-sm text-neutral-500">
        No card selected.
      </div>
    );
  }

  const name = edits.name ?? card.name;
  const rarity = edits.rarity ?? card.rarity;
  const element = edits.element !== undefined ? edits.element : card.element;
  const archetype = edits.archetype ?? card.archetype;
  const attack = edits.attack ?? card.attack;
  const defense = edits.defense ?? card.defense;
  const flavorText = edits.flavorText !== undefined ? edits.flavorText : card.flavorText;

  const stats = checkStatRange(rarity, attack, defense);
  const { genMeta } = card;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <ImgWithFallback
        key={card.id}
        src={card.imageUrl}
        alt={name}
        fallbackColor={`${RARITY_META[rarity].color}33`}
        className="mx-auto h-64 w-64 rounded-md border-2 object-cover"
        style={{ borderColor: RARITY_META[rarity].color }}
      />

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Name
          <input
            id="card-review-name-input"
            type="text"
            value={name}
            onChange={(e) => onEditField('name', e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Rarity
            <select
              value={rarity}
              onChange={(e) => onEditField('rarity', e.target.value as Rarity)}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Element
            <select
              value={element ?? NONE_ELEMENT_VALUE}
              onChange={(e) =>
                onEditField(
                  'element',
                  e.target.value === NONE_ELEMENT_VALUE ? null : (e.target.value as Element),
                )
              }
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
            >
              <option value={NONE_ELEMENT_VALUE}>none</option>
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {el}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 flex flex-col gap-1 text-xs text-neutral-400">
            Archetype
            <select
              value={archetype}
              onChange={(e) => onEditField('archetype', e.target.value as Archetype)}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
            >
              {ARCHETYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Attack (range {stats.min}-{stats.max})
            <div className="flex gap-1">
              <input
                type="number"
                value={attack}
                onChange={(e) => onEditField('attack', Number(e.target.value))}
                className={`w-full rounded border bg-neutral-950 px-2 py-1 text-sm text-neutral-100 ${
                  stats.attackInRange ? 'border-neutral-700' : 'border-red-500'
                }`}
              />
              <button
                type="button"
                onClick={() => onEditField('attack', autofillStatForRarity(rarity))}
                className="shrink-0 rounded border border-neutral-700 px-2 text-xs text-neutral-400 hover:border-amber-400 hover:text-amber-300"
              >
                Auto
              </button>
            </div>
            {!stats.attackInRange && (
              <span className="text-xs text-red-400">Out of range for {rarity}.</span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Defense (range {stats.min}-{stats.max})
            <div className="flex gap-1">
              <input
                type="number"
                value={defense}
                onChange={(e) => onEditField('defense', Number(e.target.value))}
                className={`w-full rounded border bg-neutral-950 px-2 py-1 text-sm text-neutral-100 ${
                  stats.defenseInRange ? 'border-neutral-700' : 'border-red-500'
                }`}
              />
              <button
                type="button"
                onClick={() => onEditField('defense', autofillStatForRarity(rarity))}
                className="shrink-0 rounded border border-neutral-700 px-2 text-xs text-neutral-400 hover:border-amber-400 hover:text-amber-300"
              >
                Auto
              </button>
            </div>
            {!stats.defenseInRange && (
              <span className="text-xs text-red-400">Out of range for {rarity}.</span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Flavour text
          <textarea
            value={flavorText ?? ''}
            onChange={(e) =>
              onEditField('flavorText', e.target.value.length > 0 ? e.target.value : null)
            }
            rows={2}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
      </div>

      <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Prompt
          </span>
          <CopyButton text={genMeta.prompt} label="Copy prompt" />
        </div>
        <p className="mt-1 break-words text-xs text-neutral-300">{genMeta.prompt}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Seed
          </span>
          <CopyButton text={String(genMeta.seed)} label="Copy seed" />
        </div>
        <p className="mt-1 font-mono text-xs text-neutral-300">{genMeta.seed}</p>

        <button
          type="button"
          onClick={() => onGenMetaOpenChange(!genMetaOpen)}
          className="mt-3 text-xs text-amber-400 hover:text-amber-300"
        >
          {genMetaOpen ? 'Hide generation details' : 'Show generation details'}
        </button>

        {genMetaOpen && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-neutral-400">
            <dt>Model</dt>
            <dd className="text-neutral-300">{genMeta.model}</dd>
            <dt>Negative prompt</dt>
            <dd className="break-words text-neutral-300">{genMeta.negativePrompt}</dd>
            <dt>Steps</dt>
            <dd className="text-neutral-300">{genMeta.steps}</dd>
            <dt>CFG scale</dt>
            <dd className="text-neutral-300">{genMeta.cfgScale}</dd>
            <dt>Sampler</dt>
            <dd className="text-neutral-300">{genMeta.sampler}</dd>
            <dt>Dimensions</dt>
            <dd className="text-neutral-300">
              {genMeta.width}×{genMeta.height}
            </dd>
            <dt>Recipe</dt>
            <dd className="text-neutral-300">{genMeta.recipeId}</dd>
            <dt>Generated</dt>
            <dd className="text-neutral-300">{new Date(genMeta.generatedAt).toLocaleString()}</dd>
          </dl>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="flex-1 rounded-md bg-emerald-500 py-2 text-sm font-semibold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve (A)
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onReject}
          className="flex-1 rounded-md bg-red-500 py-2 text-sm font-semibold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject (R)
        </button>
      </div>
    </div>
  );
}
