import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Owns the single shared `LedgerService` (ADR-008) — every module that
 * changes a player's balance imports this module rather than constructing
 * its own copy.
 */
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
