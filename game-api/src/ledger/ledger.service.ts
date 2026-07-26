import { Injectable } from '@nestjs/common';
import type { TransactionType } from '@card-game/shared-types';
import type { EntityManager } from 'typeorm';
import { TransactionEntity } from '../entities';

export interface RecordTransactionInput {
  playerId: string;
  type: TransactionType;
  deltaCoins: number;
  deltaKeys: number;
  refType?: string | null;
  refId?: string | null;
}

/**
 * ADR-008: every balance change anywhere in this API writes a `transactions`
 * row through this service — never touch `players.balance_*` in isolation.
 *
 * Every method takes the caller's `EntityManager` so it always runs INSIDE
 * the caller's transaction (case opens, sells, daily bonus, ...) rather than
 * opening a connection of its own. Keep this signature stable — A6 (case
 * opens) and A7 (sells, daily bonus) both depend on it.
 */
@Injectable()
export class LedgerService {
  async recordTransaction(
    manager: EntityManager,
    input: RecordTransactionInput,
  ): Promise<TransactionEntity> {
    const transaction = manager.create(TransactionEntity, {
      playerId: input.playerId,
      type: input.type,
      deltaCoins: input.deltaCoins,
      deltaKeys: input.deltaKeys,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    });
    return manager.save(transaction);
  }
}
