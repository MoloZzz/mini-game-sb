import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { MilestoneService } from './milestone.service';
import { MilestonesController } from './milestones.controller';

/**
 * Owns the single shared `MilestoneService` — `DropsModule` (openCase) and
 * `InventoryModule` (claimDailyBonus) both import this module to call
 * `checkAndAward` inside their own transactions, the same pattern they
 * already use for `LedgerModule`/`LedgerService`.
 */
@Module({
  imports: [LedgerModule],
  controllers: [MilestonesController],
  providers: [MilestoneService],
  exports: [MilestoneService],
})
export class MilestonesModule {}
