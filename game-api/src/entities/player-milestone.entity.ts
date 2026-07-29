import type { MilestoneKey } from '@card-game/shared-types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlayerEntity } from './player.entity';
import { TransactionEntity } from './transaction.entity';

/**
 * One row per collection milestone a player has been awarded (economy fix,
 * part 1). The `UNIQUE (player_id, milestone_key)` index is not decoration —
 * see the `COMMENT ON CONSTRAINT` in the `AddPlayerMilestones` migration for
 * the full double-payment-prevention rationale.
 */
@Entity('player_milestones')
@Index('UQ_player_milestones_player_key', ['playerId', 'milestoneKey'], { unique: true })
export class PlayerMilestoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({ name: 'milestone_key', type: 'text' })
  milestoneKey!: MilestoneKey;

  @CreateDateColumn({ name: 'awarded_at', type: 'timestamptz' })
  awardedAt!: Date;

  /** NULL only if the ledger transaction was later deleted (ON DELETE SET NULL) — never on insert. */
  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId!: string | null;

  @ManyToOne(() => TransactionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: TransactionEntity | null;
}
