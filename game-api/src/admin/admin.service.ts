import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { IngestCardInput, IngestResponse, ReviewCardRequest } from '@card-game/shared-types';
import type { DataSource, Repository } from 'typeorm';
import { In } from 'typeorm';
import { throwCardNotFound } from '../common/api-error';
import { PoolService } from '../collection/pool.service';
import { CardEntity } from '../entities';
import type { AdminListCardsQueryDto } from './dto/list-admin-cards.query';
import { autofillStats, slugToName } from './stat-autofill';

export interface FindAdminCardsResult {
  items: CardEntity[];
  total: number;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CardEntity)
    private readonly cardsRepository: Repository<CardEntity>,
    private readonly poolService: PoolService,
  ) {}

  /**
   * Bulk-insert `card-forge` output as `status: 'draft'`. Idempotent by
   * `slug` in two senses: (1) slugs already present in the DB are skipped,
   * checked with a SINGLE `In(slugs)` query; (2) a slug repeated within the
   * same incoming batch is only inserted once — the first occurrence wins,
   * every later occurrence counts as skipped. Re-running the exact same
   * batch must therefore insert nothing on the second call.
   */
  async ingest(cards: IngestCardInput[]): Promise<IngestResponse> {
    const seenInBatch = new Set<string>();
    const deduped: IngestCardInput[] = [];
    const duplicateWithinBatch: string[] = [];

    for (const card of cards) {
      if (seenInBatch.has(card.slug)) {
        duplicateWithinBatch.push(card.slug);
        continue;
      }
      seenInBatch.add(card.slug);
      deduped.push(card);
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const slugs = deduped.map((card) => card.slug);
      const existing =
        slugs.length > 0
          ? await manager.find(CardEntity, { where: { slug: In(slugs) }, select: ['slug'] })
          : [];
      const existingSlugs = new Set(existing.map((card) => card.slug));

      const toInsert = deduped.filter((card) => !existingSlugs.has(card.slug));
      const alreadyPresent = deduped
        .filter((card) => existingSlugs.has(card.slug))
        .map((card) => card.slug);

      const entities = toInsert.map((card) =>
        manager.create(CardEntity, {
          slug: card.slug,
          name: slugToName(card.slug),
          flavorText: null,
          rarity: card.suggestedRarity,
          element: card.element,
          archetype: card.archetype,
          attack: 0,
          defense: 0,
          imagePath: card.imagePath,
          thumbPath: card.thumbPath,
          status: 'draft',
          setId: null,
          genMeta: card.genMeta,
        }),
      );

      if (entities.length > 0) {
        await manager.save(CardEntity, entities);
      }

      const skippedSlugs = [...alreadyPresent, ...duplicateWithinBatch];
      return {
        inserted: entities.length,
        skipped: skippedSlugs.length,
        skippedSlugs,
      };
    });

    // Ingested cards land as `draft`, not `approved`, so this never actually
    // moves the approved pool — invalidated anyway to keep the "pool changed
    // via AdminService" invariant simple and to not depend on that staying true.
    this.poolService.invalidate();
    return result;
  }

  /** The review queue. Defaults to `status: 'draft'` — unlike the player catalog. */
  async findMany(query: AdminListCardsQueryDto): Promise<FindAdminCardsResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;
    const status = query.status ?? 'draft';

    const [items, total] = await this.cardsRepository.findAndCount({
      where: {
        status,
        ...(query.rarity ? { rarity: query.rarity } : {}),
        ...(query.element ? { element: query.element } : {}),
        ...(query.archetype ? { archetype: query.archetype } : {}),
      },
      // FIFO review queue — oldest drafts first.
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  /**
   * Applies only the fields the client actually sent (per `providedKeys`,
   * the key set of the RAW request body — see the comment in
   * AdminController.review for why the transformed DTO's own-property check
   * cannot be used for this), so an explicit `null` for `element`/
   * `flavorText` clears the field while an absent key leaves it untouched.
   * Q4 auto-fill: approving a never-stated card (attack/defense both still
   * 0) with no stats supplied in this same request rolls ATK/DEF from
   * `RARITY_META[<rarity after this request>].statRange`.
   */
  async update(
    id: string,
    body: ReviewCardRequest,
    providedKeys: ReadonlySet<string>,
  ): Promise<CardEntity> {
    const updatedCard = await this.dataSource.transaction(async (manager) => {
      const card = await manager.findOne(CardEntity, { where: { id } });
      if (!card) {
        throwCardNotFound(id);
      }

      const has = (key: keyof ReviewCardRequest): boolean => providedKeys.has(key);

      if (has('status') && body.status !== undefined) card.status = body.status;
      if (has('name') && body.name !== undefined) card.name = body.name;
      if (has('rarity') && body.rarity !== undefined) card.rarity = body.rarity;
      if (has('element')) card.element = body.element ?? null;
      if (has('archetype') && body.archetype !== undefined) card.archetype = body.archetype;
      if (has('attack') && body.attack !== undefined) card.attack = body.attack;
      if (has('defense') && body.defense !== undefined) card.defense = body.defense;
      if (has('flavorText')) card.flavorText = body.flavorText ?? null;

      const statsExplicitlyGiven = has('attack') || has('defense');
      const statsNeverSet = card.attack === 0 && card.defense === 0;
      // NOTE: this check runs AFTER the field assignments above, so
      // `card.attack`/`card.defense` above are untouched by this request
      // whenever `statsExplicitlyGiven` is false (nothing wrote to them),
      // meaning `statsNeverSet` still reflects the pre-request DB values.
      if (body.status === 'approved' && !statsExplicitlyGiven && statsNeverSet) {
        const { attack, defense } = autofillStats(card.rarity);
        card.attack = attack;
        card.defense = defense;
      }

      await manager.save(CardEntity, card);
      return card;
    });

    // A review can change `status` (draft <-> approved) or `rarity` — both
    // move the approved-per-rarity totals `PoolService` memoizes.
    this.poolService.invalidate();
    return updatedCard;
  }
}
