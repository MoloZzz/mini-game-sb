import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArchiveDossierEntity } from './archive-dossier.entity';
import { CardEntity } from './card.entity';
import { PlayerEntity } from './player.entity';

/** A card may be documented once per player, without consuming that card. */
@Entity('archive_notes')
@Index('uq_archive_notes_player_card', ['playerId', 'cardId'], { unique: true })
export class ArchiveNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @Column({ name: 'dossier_id', type: 'uuid' })
  dossierId!: string;

  @ManyToOne(() => ArchiveDossierEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dossier_id' })
  dossier!: ArchiveDossierEntity;

  @Column({ name: 'card_id', type: 'uuid' })
  cardId!: string;

  @ManyToOne(() => CardEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'card_id' })
  card!: CardEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
