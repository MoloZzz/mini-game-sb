import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PoolService } from './pool.service';

/**
 * Owns `PoolService`, the single source of truth for approved-card totals by
 * rarity — exported so `AdminModule` can invalidate its memo the moment a
 * card is ingested or reviewed. Imports `CardsModule` for the dex grid
 * (`GET /me/collection/cards`), which reuses `CardsService.findMany` and the
 * shared `CardMapper` rather than duplicating catalog querying/mapping.
 */
@Module({
  imports: [CardsModule, MilestonesModule],
  controllers: [CollectionController],
  providers: [PoolService, CollectionService],
  exports: [PoolService],
})
export class CollectionModule {}
