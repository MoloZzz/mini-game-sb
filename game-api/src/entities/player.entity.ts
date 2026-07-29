import { PLAYER_ROLES } from '@card-game/shared-types';
import type { PlayerRole } from '@card-game/shared-types';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../database/bigint.transformer';

@Entity('players')
export class PlayerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  // NOTE: no `default:` here on purpose — the AddPlayerAuth migration drops
  // the DB-level defaults on both balance columns (see that migration's
  // comment). Every INSERT path (seedPlayer, AuthService.register) MUST set
  // both balances explicitly via `INITIAL_GRANT`, never rely on a default,
  // so the ledger invariant SUM(delta_coins) == balance_coins (ADR-008)
  // can never be silently violated.
  @Column({
    name: 'balance_coins',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  balanceCoins!: number;

  @Column({ name: 'balance_keys', type: 'int' })
  balanceKeys!: number;

  @Column({ name: 'pity_counter', type: 'int', default: 0 })
  pityCounter!: number;

  @Column({ name: 'last_daily_claim_at', type: 'timestamptz', nullable: true })
  lastDailyClaimAt!: Date | null;

  /** NULL until an operator binds this row via `npm run account:bind`. */
  @Column({ name: 'email', type: 'text', nullable: true })
  email!: string | null;

  /** Argon2id hash. NULL until bound — see `email`. */
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({
    name: 'role',
    type: 'enum',
    enum: PLAYER_ROLES,
    enumName: 'player_role',
    default: 'player',
  })
  role!: PlayerRole;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
