import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../database/bigint.transformer';

@Entity('players')
export class PlayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({
    name: 'balance_coins',
    type: 'bigint',
    default: 1000,
    transformer: bigintTransformer,
  })
  balanceCoins!: number;

  @Column({ name: 'balance_keys', type: 'int', default: 5 })
  balanceKeys!: number;

  @Column({ name: 'pity_counter', type: 'int', default: 0 })
  pityCounter!: number;

  @Column({ name: 'last_daily_claim_at', type: 'timestamptz', nullable: true })
  lastDailyClaimAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
