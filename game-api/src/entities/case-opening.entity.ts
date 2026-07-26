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
import { CardEntity } from './card.entity';
import { CaseEntity } from './case.entity';
import { PlayerEntity } from './player.entity';

/** History of drops. Storing the whole reel enables replay and RNG debugging. */
@Entity('case_openings')
@Index('idx_case_openings_player_created', ['playerId', 'createdAt'])
@Index('uq_case_openings_idempotency', ['playerId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
export class CaseOpeningEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => CaseEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'case_id' })
  case!: CaseEntity;

  @Column({ name: 'won_card_id', type: 'uuid' })
  wonCardId!: string;

  @ManyToOne(() => CardEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'won_card_id' })
  wonCard!: CardEntity;

  /** The full array of reel card ids — enables replay and RNG debugging. */
  @Column({ name: 'reel', type: 'jsonb' })
  reel!: string[];

  @Column({ name: 'winning_index', type: 'int' })
  winningIndex!: number;

  @Column({ name: 'server_seed', type: 'text' })
  serverSeed!: string;

  @Column({ name: 'client_seed', type: 'text', nullable: true })
  clientSeed!: string | null;

  @Column({ name: 'nonce', type: 'bigint', transformer: bigintTransformer })
  nonce!: number;

  /**
   * How the optional `Idempotency-Key` header on `POST /cases/:slug/open` is
   * honoured, without inventing a seventh table. NULL for openings made
   * without the header; the partial unique index only constrains non-null keys.
   */
  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
