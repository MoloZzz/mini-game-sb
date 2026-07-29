import type { GenerationCandidateStatus } from '@card-game/shared-types';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CardEntity } from './card.entity';
import { GenerationOrderEntity } from './generation-order.entity';

@Entity('generation_order_candidates')
export class GenerationOrderCandidateEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId!: string;
  @ManyToOne(() => GenerationOrderEntity, (order) => order.candidates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' }) order!: GenerationOrderEntity;
  @Column({ name: 'candidate_index', type: 'smallint' }) index!: number;
  @Column({ type: 'text', unique: true }) slug!: string;
  @Column({ type: 'bigint' }) seed!: string;
  @Column({ type: 'text' }) status!: GenerationCandidateStatus;
  @Column({ name: 'card_id', type: 'uuid', nullable: true, unique: true }) cardId!: string | null;
  @OneToOne(() => CardEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'card_id' }) card!: CardEntity | null;
}
