import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CardDetailResponse, ListCardsResponse } from '@card-game/shared-types';
import { throwCardNotFound } from '../common/api-error';
import type { AppConfig } from '../config/configuration';
import { CardMapper } from './card.mapper';
import { CardsService } from './cards.service';
import { ListCardsQueryDto } from './dto/list-cards.query';

@Controller('cards')
export class CardsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly cardMapper: CardMapper,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async list(@Query() query: ListCardsQueryDto): Promise<ListCardsResponse> {
    const { items, total } = await this.cardsService.findMany(query);
    return {
      items: items.map((card) => this.cardMapper.toCardDto(card)),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 40,
    };
  }

  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<CardDetailResponse> {
    const card = await this.cardsService.findById(id);
    if (!card) {
      throwCardNotFound(id);
    }
    const exposeGenMeta = this.configService.get('exposeGenMeta', { infer: true });
    return this.cardMapper.toCardDetail(card, exposeGenMeta);
  }
}
