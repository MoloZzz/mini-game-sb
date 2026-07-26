import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlayersModule } from '../players/players.module';
import { DropsController } from './drops.controller';
import { DropsService } from './drops.service';

@Module({
  imports: [CardsModule, PlayersModule, LedgerModule],
  controllers: [DropsController],
  providers: [DropsService],
})
export class DropsModule {}
