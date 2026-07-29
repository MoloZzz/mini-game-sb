import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CardEntity } from '../entities';
import type { ListCardsQueryDto } from './dto/list-cards.query';

export interface FindCardsResult {
  items: CardEntity[];
  total: number;
}

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(CardEntity)
    private readonly cardsRepository: Repository<CardEntity>,
  ) {}

  /**
   * Catalog listing. Player-facing by default — an unspecified `status`
   * defaults to `approved` so drafts never leak into `GET /api/cards`.
   */
  async findMany(query: ListCardsQueryDto): Promise<FindCardsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;
    const status = query.status ?? 'approved';

    const [items, total] = await this.cardsRepository.findAndCount({
      where: {
        status,
        ...(query.rarity ? { rarity: query.rarity } : {}),
        ...(query.element ? { element: query.element } : {}),
        ...(query.archetype ? { archetype: query.archetype } : {}),
      },
      // The `card_rarity` enum was created in ascending rarity order, so
      // `rarity DESC` genuinely sorts rarest-first (verified with SQL).
      order: { rarity: 'DESC', name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  async findById(id: string): Promise<CardEntity | null> {
    return this.cardsRepository.findOne({ where: { id } });
  }

  /** Top approved cards by rarity, best first — used by CasesService for previewCards. */
  async findTopApproved(limit: number, setId?: string): Promise<CardEntity[]> {
    return this.cardsRepository.find({
      where: { status: 'approved', ...(setId ? { setId } : {}) },
      order: { rarity: 'DESC', name: 'ASC' },
      take: limit,
    });
  }
}
