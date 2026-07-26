import { Controller, Get } from '@nestjs/common';
import type { CaseDto } from '@card-game/shared-types';
import { CardMapper } from '../cards/card.mapper';
import { CasesService } from './cases.service';

@Controller('cases')
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly cardMapper: CardMapper,
  ) {}

  /** Bare array per the contract — this list is never paginated. */
  @Get()
  async list(): Promise<CaseDto[]> {
    const { cases, previewCards } = await this.casesService.findActive();
    const previewCardDtos = previewCards.map((card) => this.cardMapper.toCardDto(card));

    return cases.map((caseEntity) => ({
      slug: caseEntity.slug,
      name: caseEntity.name,
      priceCoins: caseEntity.priceCoins,
      priceKeys: caseEntity.priceKeys,
      imageUrl: this.cardMapper.toUrl(caseEntity.imagePath),
      odds: caseEntity.rarityWeights,
      previewCards: previewCardDtos,
    }));
  }
}
