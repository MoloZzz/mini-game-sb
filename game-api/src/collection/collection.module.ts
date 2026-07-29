import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PoolService } from './pool.service';

/**
 * Owns `PoolService`, the single source of truth for approved-card totals by
 * rarity — exported so `AdminModule` can invalidate its memo the moment a
 * card is ingested or reviewed.
 */
@Module({
  controllers: [CollectionController],
  providers: [PoolService, CollectionService],
  exports: [PoolService],
})
export class CollectionModule {}
