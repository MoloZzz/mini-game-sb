import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardEntity } from '../entities';
import { CardMapper } from './card.mapper';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

/**
 * Owns the single shared `CardMapper` instance (the S3 seam, ADR-002) —
 * every other module that needs to turn a CardEntity into a DTO imports this
 * module rather than constructing its own mapper.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CardEntity])],
  controllers: [CardsController],
  providers: [CardsService, CardMapper],
  exports: [CardsService, CardMapper],
})
export class CardsModule {}
