import type { RarityWeights } from '@card-game/shared-types';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../database/bigint.transformer';

@Entity('cases')
export class CaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'slug', type: 'text', unique: true })
  slug!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  /** A case costs EITHER coins OR a key. */
  @Column({
    name: 'price_coins',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  priceCoins!: number | null;

  @Column({ name: 'price_keys', type: 'int', nullable: true })
  priceKeys!: number | null;

  /** RELATIVE path. */
  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string;

  @Column({ name: 'rarity_weights', type: 'jsonb' })
  rarityWeights!: RarityWeights;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
