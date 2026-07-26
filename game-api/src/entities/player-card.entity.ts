import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CardEntity } from './card.entity';
import { CaseOpeningEntity } from './case-opening.entity';
import { PlayerEntity } from './player.entity';

/**
 * Inventory. ADR-012 — one row per instance. There must be NO `quantity`
 * column and NO `UNIQUE(player_id, card_id)` constraint: duplicates are a
 * feature — they are the fuel of the sell economy and give per-instance
 * history.
 */
@Entity('player_cards')
@Index('idx_player_cards_player_sold', ['playerId', 'soldAt'])
export class PlayerCardEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId!: string;

  @ManyToOne(() => CardEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'card_id' })
  card!: CardEntity;

  @Column({ name: 'drop_id', type: 'uuid', nullable: true })
  dropId!: string | null;

  @ManyToOne(() => CaseOpeningEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'drop_id' })
  drop!: CaseOpeningEntity | null;

  @CreateDateColumn({ name: 'acquired_at', type: 'timestamptz' })
  acquiredAt!: Date;

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt!: Date | null;
}
