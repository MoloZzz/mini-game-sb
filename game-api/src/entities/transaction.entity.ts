import { TRANSACTION_TYPES } from '@card-game/shared-types';
import type { TransactionType } from '@card-game/shared-types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintTransformer } from '../database/bigint.transformer';
import { PlayerEntity } from './player.entity';

/**
 * Ledger. `SUM(delta_coins) == players.balance_coins` is the invariant that
 * catches any economy bug with one query (ADR-008). `players.balance_*`
 * stays as a denormalized cache for fast reads.
 */
@Entity('transactions')
@Index('idx_transactions_player_created', ['playerId', 'createdAt'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({
    name: 'type',
    type: 'enum',
    enum: TRANSACTION_TYPES,
    enumName: 'transaction_type',
  })
  type!: TransactionType;

  @Column({
    name: 'delta_coins',
    type: 'bigint',
    default: 0,
    transformer: bigintTransformer,
  })
  deltaCoins!: number;

  @Column({ name: 'delta_keys', type: 'int', default: 0 })
  deltaKeys!: number;

  @Column({ name: 'ref_type', type: 'text', nullable: true })
  refType!: string | null;

  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
