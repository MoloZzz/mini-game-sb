import { ARCHETYPES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, Element, GenerationOrderStatus, Rarity } from '@card-game/shared-types';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { GenerationOrderCandidateEntity } from './generation-order-candidate.entity';

@Entity('generation_orders')
export class GenerationOrderEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'text' }) status!: GenerationOrderStatus;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text' }) brief!: string;
  @Column({ type: 'enum', enum: ARCHETYPES, enumName: 'card_archetype' }) archetype!: Archetype;
  @Column({ type: 'enum', enum: ELEMENTS, enumName: 'card_element', nullable: true }) element!: Element | null;
  @Column({ name: 'suggested_rarity', type: 'enum', enum: RARITIES, enumName: 'card_rarity' }) suggestedRarity!: Rarity;
  @Column({ name: 'candidate_count', type: 'smallint' }) candidateCount!: number;
  @Column({ name: 'set_id', type: 'uuid', nullable: true }) setId!: string | null;
  @Column({ name: 'recipe_profile', type: 'text', default: 'card-v1' }) recipeProfile!: 'card-v1';
  @Column({ name: 'created_by_player_id', type: 'uuid' }) createdByPlayerId!: string;
  @Column({ name: 'run_id', type: 'uuid', nullable: true }) runId!: string | null;
  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true }) readyAt!: Date | null;
  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true }) generatedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'failure_code', type: 'text', nullable: true }) failureCode!: string | null;
  @Column({ name: 'failure_detail', type: 'text', nullable: true }) failureDetail!: string | null;
  @OneToMany(() => GenerationOrderCandidateEntity, (candidate) => candidate.order) candidates!: GenerationOrderCandidateEntity[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
