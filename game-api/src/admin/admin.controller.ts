import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AdminCardDto, AdminListCardsResponse, IngestResponse } from '@card-game/shared-types';
import type { Request } from 'express';
import { CardMapper } from '../cards/card.mapper';
import { AdminService } from './admin.service';
import { AdminListCardsQueryDto } from './dto/list-admin-cards.query';
import { IngestRequestDto } from './dto/ingest.dto';
import { ReviewCardDto } from './dto/review-card.dto';

/** `card-forge` ingest + manual card review (vault 03, "Admin"). */
@Controller('admin/cards')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly cardMapper: CardMapper,
  ) {}

  @Post('ingest')
  @HttpCode(200)
  async ingest(@Body() body: IngestRequestDto): Promise<IngestResponse> {
    return this.adminService.ingest(body.cards);
  }

  @Get()
  async list(@Query() query: AdminListCardsQueryDto): Promise<AdminListCardsResponse> {
    const { items, total } = await this.adminService.findMany(query);
    return {
      items: items.map((card) => this.cardMapper.toAdminCardDto(card)),
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 40,
    };
  }

  @Patch(':id')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewCardDto,
    @Req() req: Request,
  ): Promise<AdminCardDto> {
    // TypeScript (with experimentalDecorators + emitDecoratorMetadata) emits
    // every declared class field as an own property initialized to
    // `undefined` at construction time, REGARDLESS of whether the client
    // sent that key. That makes `hasOwnProperty` on the transformed `body`
    // useless for telling "absent key" apart from "explicit null" (verified
    // empirically: `new ReviewCardDto()` already owns all 8 fields). The
    // raw, pre-transform `req.body` is the only place that still reflects
    // exactly what the client sent, so its key set is what decides
    // "touched vs. untouched" — the parsed/validated `body` DTO instance is
    // still what supplies the (type-checked) values.
    const providedKeys = new Set(Object.keys((req.body ?? {}) as Record<string, unknown>));
    const card = await this.adminService.update(id, body, providedKeys);
    return this.cardMapper.toAdminCardDto(card);
  }
}
