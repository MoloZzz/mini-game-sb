import { RARITY_META, type Balance, type CaseDto } from '@card-game/shared-types';

import { caseThemeFor } from './caseTheme';
import { ImgWithFallback } from './ImgWithFallback';
import { canAffordCase, casePrice } from './pricing';

interface CaseCardProps {
  case: CaseDto;
  onOpen: (slug: string) => void;
  disabled?: boolean;
  balance: Balance;
}

const CURRENCY_GLYPH = { coins: '🪙', keys: '🔑' } as const;

/**
 * A lobby tile: art, name, a preview strip, price and an Open button. When
 * the player can't afford it the button is disabled and the price turns red
 * with a short hint — the player should never be able to click into a
 * guaranteed 402 from here.
 */
export function CaseCard({ case: caseDto, onOpen, disabled, balance }: CaseCardProps) {
  const { amount, currency } = casePrice(caseDto);
  const canAfford = canAffordCase(caseDto, balance);
  const isDisabled = Boolean(disabled) || !canAfford;
  const theme = caseThemeFor(caseDto.slug);

  return (
    <div
      data-testid="case-card"
      data-case-slug={caseDto.slug}
      className="flex flex-col overflow-hidden rounded-lg border bg-neutral-900 transition-transform duration-150 will-change-transform hover:-translate-y-1"
      style={{ borderColor: `${theme.color}66`, boxShadow: `0 0 0 1px transparent, 0 4px 16px -6px ${theme.color}4d` }}
    >
      <div className="relative">
        <ImgWithFallback src={caseDto.imageUrl} alt="" className="aspect-square w-full object-cover" />
        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-950"
          style={{ backgroundColor: theme.color }}
        >
          <span aria-hidden="true">{theme.glyph}</span>
          {theme.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-semibold text-neutral-100">{caseDto.name}</h3>

        <div className="flex gap-1.5">
          {caseDto.previewCards.map((card) => (
            <ImgWithFallback
              key={card.id}
              src={card.thumbUrl}
              alt={card.name}
              title={card.name}
              fallbackColor={`${RARITY_META[card.rarity].color}33`}
              className="h-8 w-8 rounded border border-neutral-700 object-cover"
            />
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <span
              className={`flex items-center gap-1 text-sm font-medium ${
                canAfford ? 'text-neutral-200' : 'text-red-400'
              }`}
            >
              <span aria-hidden="true">{CURRENCY_GLYPH[currency]}</span>
              {amount.toLocaleString()}
            </span>
            {!canAfford && <span className="text-xs text-red-400">Not enough {currency}</span>}
          </div>

          <button
            type="button"
            disabled={isDisabled}
            onClick={(event) => {
              // Selecting the case (to view its detail) is handled by a
              // click listener the lobby wraps this card in — Open should
              // act immediately without also triggering that selection.
              event.stopPropagation();
              if (!isDisabled) onOpen(caseDto.slug);
            }}
            className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
