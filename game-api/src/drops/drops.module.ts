import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MilestonesModule } from '../milestones/milestones.module';
import { DropsController } from './drops.controller';
import { DropsService } from './drops.service';

@Module({
  imports: [CardsModule, LedgerModule, MilestonesModule],
  controllers: [DropsController],
  providers: [DropsService],
  exports: [DropsService],
})
export class DropsModule {}
