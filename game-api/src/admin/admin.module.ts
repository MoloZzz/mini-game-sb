import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CardsModule } from '../cards/cards.module';
import { CollectionModule } from '../collection/collection.module';
import { CardEntity } from '../entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Imports `CardsModule` rather than constructing its own mapper — `CardMapper`
 * is the single S3 seam (ADR-002) and must stay a single shared instance.
 * Imports `CollectionModule` for `PoolService`: ingest/review are the only
 * two places the approved-card pool changes, so they're the only two places
 * that must invalidate its memo. Imports `AuthModule` so `ServiceTokenGuard`
 * (used via `@UseGuards()` on the ingest route) resolves its own dependencies
 * — the exact same singleton `AuthModule` already wired up.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CardEntity]), CardsModule, CollectionModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
