import { useEffect } from 'react';
import type { Balance, CaseDto } from '@card-game/shared-types';

import { Button } from '@/components/Button';
import { OddsTable } from '@/components/OddsTable';
import { preloadOpenCaseScreen } from '@/features/open/openCaseRoute';
import { ImgWithFallback } from '@/components/ui/ImgWithFallback';
import { rarityTint } from '@/lib/rarityStyle';

import { caseThemeFor } from './caseTheme';
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

  // Touch and keyboard users do not hover the grid. Reaching the informed
  // decision screen is therefore the non-hover prefetch point.
  useEffect(() => {
    preloadOpenCaseScreen();
  }, []);

  return (
    <div
      data-testid="case-detail"
      data-case-slug={caseDto.slug}
      className="flex flex-col gap-4 rounded-lg border bg-neutral-900 p-4 sm:p-6"
      style={{ borderColor: `${theme.color}66` }}
    >
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start px-0">
        ← Back
      </Button>

      <div className="flex flex-col gap-6 sm:flex-row">
        <ImgWithFallback
          src={caseDto.imageUrl}
          alt=""
          className="h-40 w-40 self-center rounded-lg border-2 object-cover sm:h-48 sm:w-48 sm:self-start"
          style={{ borderColor: theme.color }}
        />

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
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
                fallbackColor={rarityTint(card.rarity, 'fallback')}
                className="h-14 w-14 rounded border border-neutral-700 object-cover"
              />
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span
              className={`flex items-center gap-1 text-lg font-semibold ${
                canAfford ? 'text-neutral-200' : 'text-red-400'
              }`}
            >
              <span aria-hidden="true">{CURRENCY_GLYPH[currency]}</span>
              {amount.toLocaleString()}
            </span>

            <Button className="w-full sm:w-auto" disabled={!canAfford} onClick={() => onOpen(caseDto.slug)}>
              Open case
            </Button>
          </div>
          {!canAfford && <p className="text-right text-xs text-red-400">Not enough {currency}</p>}
        </div>
      </div>
    </div>
  );
}
