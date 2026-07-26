import { RARITY_META, type Balance, type CaseDto } from '@card-game/shared-types';

import { OddsTable } from '@/components/OddsTable';

import { caseThemeFor } from './caseTheme';
import { ImgWithFallback } from './ImgWithFallback';
import { canAffordCase, casePrice } from './pricing';

interface CaseDetailProps {
  case: CaseDto;
  balance: Balance;
  onOpen: (slug: string) => void;
  onBack: () => void;
}

const CURRENCY_GLYPH = { coins: '🪙', keys: '🔑' } as const;

/**
 * The decision screen. Per the core loop, clicking a case shows odds and the
 * open button together — the odds are part of the decision, not a footnote,
 * so the full OddsTable sits above the button rather than behind a toggle.
 */
export function CaseDetail({ case: caseDto, balance, onOpen, onBack }: CaseDetailProps) {
  const { amount, currency } = casePrice(caseDto);
  const canAfford = canAffordCase(caseDto, balance);
  const theme = caseThemeFor(caseDto.slug);

  return (
    <div
      data-testid="case-detail"
      data-case-slug={caseDto.slug}
      className="flex flex-col gap-4 rounded-lg border bg-neutral-900 p-6"
      style={{ borderColor: `${theme.color}66` }}
    >
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-neutral-400 transition-colors hover:text-neutral-200"
      >
        ← Back
      </button>

      <div className="flex flex-col gap-6 sm:flex-row">
        <ImgWithFallback
          src={caseDto.imageUrl}
          alt=""
          className="h-48 w-48 self-center rounded-lg border-2 object-cover sm:self-start"
          style={{ borderColor: theme.color }}
        />

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-neutral-100">{caseDto.name}</h2>
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-950"
              style={{ backgroundColor: theme.color }}
            >
              <span aria-hidden="true">{theme.glyph}</span>
              {theme.label}
            </span>
          </div>

          <OddsTable odds={caseDto.odds} />

          <div className="flex flex-wrap gap-2">
            {caseDto.previewCards.map((card) => (
              <ImgWithFallback
                key={card.id}
                src={card.thumbUrl}
                alt={card.name}
                title={card.name}
                fallbackColor={`${RARITY_META[card.rarity].color}33`}
                className="h-14 w-14 rounded border border-neutral-700 object-cover"
              />
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-4">
            <span
              className={`flex items-center gap-1 text-lg font-semibold ${
                canAfford ? 'text-neutral-200' : 'text-red-400'
              }`}
            >
              <span aria-hidden="true">{CURRENCY_GLYPH[currency]}</span>
              {amount.toLocaleString()}
            </span>

            <button
              type="button"
              disabled={!canAfford}
              onClick={() => onOpen(caseDto.slug)}
              className="rounded-lg bg-amber-400 px-8 py-3 text-base font-bold text-neutral-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open case
            </button>
          </div>
          {!canAfford && <p className="text-right text-xs text-red-400">Not enough {currency}</p>}
        </div>
      </div>
    </div>
  );
}
