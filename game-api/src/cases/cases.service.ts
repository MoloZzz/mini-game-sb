import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { RarityWeights } from '@card-game/shared-types';
import type { Repository } from 'typeorm';
import { CaseEntity } from '../entities';
import { CardsService } from '../cards/cards.service';

const PREVIEW_CARD_COUNT = 6;

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(CaseEntity)
    private readonly casesRepository: Repository<CaseEntity>,
    private readonly cardsService: CardsService,
  ) {}

  /**
   * Active cases, cheapest coin price first (Postgres sorts NULL as larger
   * than any value, so ASC + NULLS LAST puts the key-priced case last), tied
   * broken by slug. `previewCards` is the SAME top-6-approved-cards list
   * reused for every case — one query total, not one per case.
   */
  async findActive(): Promise<{ cases: CaseEntity[]; previewCardsByCase: Map<string, Awaited<ReturnType<CardsService['findTopApproved']>>> }> {
    const cases = await this.casesRepository
      .createQueryBuilder('case')
      .where('case.is_active = true')
      .orderBy('case.price_coins', 'ASC', 'NULLS LAST')
      .addOrderBy('case.slug', 'ASC')
      .getMany();

    const globalPreview = await this.cardsService.findTopApproved(PREVIEW_CARD_COUNT);
    const previewCardsByCase = new Map<string, Awaited<ReturnType<CardsService['findTopApproved']>>>();
    for (const caseEntity of cases) {
      previewCardsByCase.set(
        caseEntity.slug,
        caseEntity.setId
          ? await this.cardsService.findTopApproved(PREVIEW_CARD_COUNT, caseEntity.setId)
          : globalPreview,
      );
    }
    return { cases, previewCardsByCase };
  }

  async findBySlug(slug: string): Promise<CaseEntity | null> {
    return this.casesRepository.findOne({ where: { slug } });
  }

  /** `rarity_weights` jsonb, returned verbatim as the RarityWeights shape. */
  static oddsOf(caseEntity: CaseEntity): RarityWeights {
    return caseEntity.rarityWeights;
  }
}
