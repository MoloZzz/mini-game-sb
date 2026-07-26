import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsModule } from '../cards/cards.module';
import { CardEntity } from '../entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Imports `CardsModule` rather than constructing its own mapper — `CardMapper`
 * is the single S3 seam (ADR-002) and must stay a single shared instance.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CardEntity]), CardsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
