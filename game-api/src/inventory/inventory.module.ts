import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlayersModule } from '../players/players.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CardsModule, PlayersModule, LedgerModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
