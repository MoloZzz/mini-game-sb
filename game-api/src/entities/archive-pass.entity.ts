import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArchiveDossierEntity } from './archive-dossier.entity';
import { CaseOpeningEntity } from './case-opening.entity';
import { PlayerEntity } from './player.entity';

/** A one-use, non-currency entitlement to an Archive Cache reveal. */
@Entity('archive_passes')
@Index('uq_archive_passes_dossier', ['dossierId'], { unique: true })
@Index('uq_archive_passes_opening', ['openingId'], {
  unique: true,
  where: '"opening_id" IS NOT NULL',
})
export class ArchivePassEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @OneToOne(() => ArchiveDossierEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ArchiveDossierEntity;

  @Column({ name: 'opening_id', type: 'uuid', nullable: true })
  openingId!: string | null;

  @OneToOne(() => CaseOpeningEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'opening_id' })
  opening!: CaseOpeningEntity | null;

  @CreateDateColumn({ name: 'earned_at', type: 'timestamptz' })
  earnedAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
