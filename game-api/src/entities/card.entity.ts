import { ARCHETYPES, CARD_STATUSES, ELEMENTS, RARITIES } from '@card-game/shared-types';
import type { Archetype, CardStatus, Element, GenMeta, Rarity } from '@card-game/shared-types';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Catalog of generated cards. Only `status = 'approved'` cards feed the roulette. */
@Entity('cards')
@Index('idx_cards_status_rarity', ['status', 'rarity'])
export class CardEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'slug', type: 'text', unique: true })
  slug!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;

  @Column({ name: 'flavor_text', type: 'text', nullable: true })
  flavorText!: string | null;

  @Column({ name: 'rarity', type: 'enum', enum: RARITIES, enumName: 'card_rarity' })
  rarity!: Rarity;

  @Column({
    name: 'element',
    type: 'enum',
    enum: ELEMENTS,
    enumName: 'card_element',
    nullable: true,
  })
  element!: Element | null;

  @Column({ name: 'archetype', type: 'enum', enum: ARCHETYPES, enumName: 'card_archetype' })
  archetype!: Archetype;

  @Column({ name: 'attack', type: 'int', default: 0 })
  attack!: number;

  @Column({ name: 'defense', type: 'int', default: 0 })
  defense!: number;

  /** RELATIVE path, e.g. `cards/ember-drake-a3f1.png`. Never absolute, never a URL. */
  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string;

  /** RELATIVE path. */
  @Column({ name: 'thumb_path', type: 'text' })
  thumbPath!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: CARD_STATUSES,
    enumName: 'card_status',
    default: 'draft',
  })
  status!: CardStatus;

  /**
   * Thematic set — not used yet. NULLABLE from this first migration (vault
   * Q9): adding a nullable column now is free, migrating 300 rows later is not.
   */
  @Column({ name: 'set_id', type: 'uuid', nullable: true })
  setId!: string | null;

  @Column({ name: 'gen_meta', type: 'jsonb', default: () => "'{}'" })
  genMeta!: GenMeta | Record<string, never>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
