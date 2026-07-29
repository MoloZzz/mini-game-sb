import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CardsModule, LedgerModule, MilestonesModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
