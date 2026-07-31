import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ARCHETYPE_RARITIES } from '@card-game/shared-types';
import type { CardStatus, CompleteGenerationOrderRequest, CreateGenerationOrderRequest, ForgeGenerationOrderDto, GenerationCandidateStatus, GenerationOrderDto, GenerationOrderProvenance, GenerationOrdersListResponse, UpdateGenerationOrderRequest } from '@card-game/shared-types';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import { In } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { apiError } from '../common/api-error';
import { CardMapper } from '../cards/card.mapper';
import { CardEntity, GenerationOrderCandidateEntity, GenerationOrderEntity } from '../entities';
import { PoolService } from '../collection/pool.service';
import { slugToName } from './stat-autofill';
import type { ListGenerationOrdersQueryDto } from './dto/list-generation-orders.query';

/** A card's review verdict, expressed on its candidate row. */
const CANDIDATE_STATUS_BY_CARD_STATUS: Readonly<Record<CardStatus, GenerationCandidateStatus>> = {
  draft: 'generated',
  approved: 'selected',
  rejected: 'discarded',
};

@Injectable()
export class GenerationOrdersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly poolService: PoolService,
    private readonly cardMapper: CardMapper,
  ) {}

  async create(createdByPlayerId: string, input: CreateGenerationOrderRequest): Promise<GenerationOrderDto> {
    this.assertArchetypeRarity(input.archetype, input.suggestedRarity);
    const candidateCount = input.candidateCount ?? 4;
    const title = input.title.trim();
    const order = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(manager.create(GenerationOrderEntity, {
        status: 'draft', title, brief: input.brief.trim(), archetype: input.archetype,
        element: input.element ?? null, suggestedRarity: input.suggestedRarity, candidateCount,
        setId: input.setId ?? null, recipeProfile: 'card-v1', createdByPlayerId,
        readyAt: null, generatedAt: null, completedAt: null, failureCode: null, failureDetail: null, runId: null,
      }));
      const candidates = this.createCandidates(manager, created.id, candidateCount, title);
      await manager.save(candidates);
      created.candidates = candidates;
      return created;
    });
    return this.toDto(order, new Map());
  }

  async list(query: ListGenerationOrdersQueryDto): Promise<GenerationOrdersListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 40;
    const [orders, total] = await this.dataSource.getRepository(GenerationOrderEntity).findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: { candidates: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const cards = await this.loadCandidateCards(orders);
    return { items: orders.map((order) => this.toDto(order, cards)), total, page, limit };
  }

  async get(id: string): Promise<GenerationOrderDto> {
    const order = await this.findOrder(id);
    return this.toDto(order, await this.loadCandidateCards([order]));
  }

  async update(id: string, input: UpdateGenerationOrderRequest): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['draft']);
      if (input.title !== undefined) order.title = input.title.trim();
      if (input.brief !== undefined) order.brief = input.brief.trim();
      if (input.archetype !== undefined) order.archetype = input.archetype;
      if (input.element !== undefined) order.element = input.element;
      if (input.suggestedRarity !== undefined) order.suggestedRarity = input.suggestedRarity;
      if (input.setId !== undefined) order.setId = input.setId;
      this.assertArchetypeRarity(order.archetype, order.suggestedRarity);
      // The slug carries the title, so a renamed draft has to re-roll its
      // candidate crop as well — otherwise the generated cards keep the old
      // name forever. Still draft, so no card exists to invalidate.
      const titleChanged = input.title !== undefined;
      const countChanged = input.candidateCount !== undefined && input.candidateCount !== order.candidateCount;
      if (titleChanged || countChanged) {
        await manager.delete(GenerationOrderCandidateEntity, { orderId: order.id });
        if (input.candidateCount !== undefined) order.candidateCount = input.candidateCount;
        await manager.save(this.createCandidates(manager, order.id, order.candidateCount, order.title));
      }
      await manager.save(order);
    });
    return this.get(id);
  }

  /**
   * Closes an order for good. Accepts `review` as well as `draft`/`ready`: an
   * operator who rejects every candidate has to be able to walk away, and
   * before this the order stayed in `review` forever with no transition out.
   */
  async cancel(id: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['draft', 'ready', 'review']);
      if (order.status === 'review') {
        const candidates = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: id } });
        await this.rejectDraftCards(manager, candidates);
        for (const candidate of candidates) candidate.status = 'discarded';
        if (candidates.length > 0) await manager.save(candidates);
      }
      order.status = 'cancelled'; await manager.save(order);
    });
    this.poolService.invalidate();
    return this.get(id);
  }

  async queue(id: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockOrder(manager, id);
      this.assertState(current, ['draft']);
      current.status = 'ready'; current.readyAt = new Date(); current.failureCode = null; current.failureDetail = null;
      await manager.save(current);
    });
    return this.get(id);
  }

  /** Re-queues the same candidate crop — identical seeds, so identical output. */
  async retry(id: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockOrder(manager, id);
      this.assertState(current, ['failed']);
      current.status = 'ready'; current.runId = null; current.readyAt = new Date();
      current.failureCode = null; current.failureDetail = null;
      await manager.save(current);
    });
    return this.get(id);
  }

  /**
   * The escape hatch from `review`: throws away the current crop (its draft
   * cards become `rejected`) and queues a fresh one with new seeds. Unlike
   * `retry`, which replays the same seeds, this actually produces different
   * art — which is what an operator who disliked all six candidates wants.
   * Also accepted from `failed`, where a re-roll often beats a replay.
   */
  async regenerate(id: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['review', 'failed']);
      const candidates = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: id } });
      await this.rejectDraftCards(manager, candidates);
      await manager.delete(GenerationOrderCandidateEntity, { orderId: id });
      await manager.save(this.createCandidates(manager, order.id, order.candidateCount, order.title));
      order.status = 'ready'; order.runId = null; order.readyAt = new Date();
      order.generatedAt = null; order.failureCode = null; order.failureDetail = null;
      await manager.save(order);
    });
    this.poolService.invalidate();
    return this.get(id);
  }

  async claim(id: string): Promise<ForgeGenerationOrderDto> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['ready']);
      order.status = 'generating'; order.runId = randomUUID();
      await manager.save(order);
      const candidates = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: order.id }, order: { index: 'ASC' } });
      return this.toForgeDto(order, candidates);
    });
  }

  /**
   * Atomically lease the oldest ready order. SKIP LOCKED lets several local
   * workers poll concurrently without waiting for, or double-claiming, one
   * another's selected row.
   */
  async claimNext(): Promise<ForgeGenerationOrderDto | null> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(GenerationOrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('order.status = :status', { status: 'ready' })
        .orderBy('order.ready_at', 'ASC')
        .addOrderBy('order.created_at', 'ASC')
        .getOne();
      if (!order) return null;

      order.status = 'generating';
      order.runId = randomUUID();
      await manager.save(order);
      const candidates = await manager.find(GenerationOrderCandidateEntity, {
        where: { orderId: order.id }, order: { index: 'ASC' },
      });
      return this.toForgeDto(order, candidates);
    });
  }

  async complete(id: string, input: CompleteGenerationOrderRequest): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      // A second submission for an order already in review used to no-op
      // silently, so a forge worker that double-sent looked successful while
      // its second batch of images was quietly dropped. Say so instead.
      this.assertState(order, ['generating']);
      if (order.runId !== input.runId) apiError(409, 'GENERATION_RUN_CONFLICT', 'The forge run does not own this order');
      const planned = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: id }, order: { index: 'ASC' } });
      if (planned.length !== input.candidates.length) apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidate count does not match the order');
      const byId = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
      if (byId.size !== planned.length || planned.some((candidate) => !byId.has(candidate.id))) {
        apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidates do not match this order');
      }

      const cards = planned.map((candidate) => {
        const output = byId.get(candidate.id)!;
        this.assertRelativePath(output.imagePath); this.assertRelativePath(output.thumbPath);
        this.assertSeedMatches(output.genMeta.seed, candidate.seed);
        const provenance: GenerationOrderProvenance = {
          orderId: order.id, candidateId: candidate.id, promptTemplateVersion: order.recipeProfile,
        };
        return manager.create(CardEntity, {
          slug: candidate.slug, name: this.cardNameFor(order.title, candidate.slug), flavorText: null,
          rarity: order.suggestedRarity, element: order.element, archetype: order.archetype,
          attack: 0, defense: 0, imagePath: output.imagePath, thumbPath: output.thumbPath,
          status: 'draft', setId: order.setId,
          genMeta: { ...output.genMeta, generationOrder: provenance },
        });
      });

      // One INSERT for every card and one UPDATE for every candidate, rather
      // than a round trip per candidate inside the lock.
      const saved = await manager.save(cards);
      planned.forEach((candidate, index) => {
        candidate.cardId = saved[index]!.id;
        candidate.status = 'generated';
      });
      await manager.save(planned);
      order.status = 'review'; order.generatedAt = new Date(); await manager.save(order);
    });
    this.poolService.invalidate();
    return this.get(id);
  }

  async fail(id: string, runId: string, code: string, detail?: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['generating']);
      if (order.runId !== runId) apiError(409, 'GENERATION_RUN_CONFLICT', 'The forge run does not own this order');
      order.status = 'failed'; order.failureCode = code; order.failureDetail = detail?.slice(0, 500) ?? null; await manager.save(order);
    });
    return this.get(id);
  }

  /**
   * Mirrors an admin's verdict on one generated card onto its candidate row,
   * inside the caller's transaction so the card and the candidate can never
   * disagree.
   *
   * Candidates are independent. Approving one says nothing about its siblings:
   * they stay `generated` and reviewable, so an operator who likes three of
   * four crops keeps all three. The order closes only once every candidate has
   * been decided and at least one was approved; an order whose crop was
   * rejected outright stays in `review`, where Regenerate and Cancel live.
   */
  async applyCardDecision(manager: EntityManager, card: CardEntity): Promise<void> {
    // Cards from a plain `forge.py batch` ingest carry no provenance and have
    // no candidate row — skip the lookup entirely for the common case.
    if (!card.genMeta?.generationOrder) return;
    const candidate = await manager.findOneBy(GenerationOrderCandidateEntity, { cardId: card.id });
    if (!candidate) return;

    candidate.status = CANDIDATE_STATUS_BY_CARD_STATUS[card.status];
    await manager.save(candidate);

    const order = await this.lockOrder(manager, candidate.orderId);
    if (order.status !== 'review' && order.status !== 'completed') return;
    const siblings = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: order.id } });
    const undecided = siblings.some((row) => row.status === 'planned' || row.status === 'generated');
    const anyApproved = siblings.some((row) => row.status === 'selected');

    if (!undecided && anyApproved) {
      order.status = 'completed';
      order.completedAt ??= new Date();
    } else {
      // Also the path back out of `completed`: sending an approved card back to
      // draft re-opens its order rather than leaving it closed over a candidate
      // that is undecided again.
      order.status = 'review';
      order.completedAt = null;
    }
    await manager.save(order);
  }

  /**
   * Retires a candidate crop in one UPDATE. The `status: 'draft'` criterion is
   * a guard, not an optimisation: a card that an admin already approved by
   * hand must never be flipped to `rejected` by a sibling's selection.
   */
  private async rejectDraftCards(
    manager: EntityManager,
    candidates: GenerationOrderCandidateEntity[],
    keepCardId?: string | null,
  ): Promise<void> {
    const ids = candidates
      .map((candidate) => candidate.cardId)
      .filter((cardId): cardId is string => cardId !== null && cardId !== keepCardId);
    if (ids.length === 0) return;
    await manager.update(CardEntity, { id: In(ids), status: 'draft' }, { status: 'rejected' });
  }

  /** One `In()` query for every candidate card across every order in the page. */
  private async loadCandidateCards(orders: GenerationOrderEntity[]): Promise<Map<string, CardEntity>> {
    const ids = orders
      .flatMap((order) => order.candidates ?? [])
      .map((candidate) => candidate.cardId)
      .filter((cardId): cardId is string => cardId !== null);
    if (ids.length === 0) return new Map();
    const cards = await this.dataSource.getRepository(CardEntity).find({ where: { id: In(ids) } });
    return new Map(cards.map((card) => [card.id, card]));
  }

  private async findOrder(id: string): Promise<GenerationOrderEntity> {
    const order = await this.dataSource.getRepository(GenerationOrderEntity).findOne({ where: { id }, relations: { candidates: true } });
    if (!order) apiError(404, 'GENERATION_ORDER_NOT_FOUND', `Generation order ${id} not found`, { id });
    return order;
  }
  private async lockOrder(manager: EntityManager, id: string): Promise<GenerationOrderEntity> {
    const order = await manager.getRepository(GenerationOrderEntity).createQueryBuilder('order').setLock('pessimistic_write').where('order.id = :id', { id }).getOne();
    if (!order) apiError(404, 'GENERATION_ORDER_NOT_FOUND', `Generation order ${id} not found`, { id });
    return order;
  }
  private assertState(order: GenerationOrderEntity, accepted: readonly string[]): void {
    if (!accepted.includes(order.status)) apiError(409, 'INVALID_GENERATION_ORDER_STATE', `Order is ${order.status}; expected ${accepted.join(' or ')}`, { status: order.status });
  }
  private assertArchetypeRarity(archetype: keyof typeof ARCHETYPE_RARITIES, rarity: string): void {
    if (!ARCHETYPE_RARITIES[archetype].includes(rarity as never)) apiError(400, 'GENERATION_CANDIDATE_MISMATCH', `Rarity ${rarity} is not allowed for ${archetype}`);
  }
  private assertRelativePath(path: string): void {
    if (!/^(?!https?:\/\/)(?!\/).+$/.test(path)) apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Generated asset path must be relative');
  }
  /** `Number('abc')` is NaN and `NaN !== NaN`, so a malformed seed used to slip past a bare `!==`. */
  private assertSeedMatches(reported: unknown, planned: string): void {
    const left = Number(reported);
    const right = Number(planned);
    if (!Number.isFinite(left) || !Number.isFinite(right) || left !== right) {
      apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidate seed does not match the planned seed');
    }
  }

  /**
   * `ember-drake-9f2a1c-1`. The random middle segment identifies the crop, not
   * the order: `regenerate` throws candidates away and rebuilds them at the
   * same indices, and `cards.slug` is UNIQUE — reusing the order id there
   * would collide with the cards the discarded crop left behind.
   */
  private createCandidates(manager: EntityManager, orderId: string, count: number, title: string): GenerationOrderCandidateEntity[] {
    const base = `${this.slugifyTitle(title)}-${randomBytes(3).toString('hex')}`;
    return Array.from({ length: count }, (_, index) => manager.create(GenerationOrderCandidateEntity, {
      orderId, index: index + 1, slug: `${base}-${index + 1}`,
      seed: String(randomInt(1, 2_147_483_647)), status: 'planned', cardId: null,
    }));
  }
  private slugifyTitle(title: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.length > 0 ? slug.slice(0, 48) : 'order';
  }
  /** The order title is the operator's own words; fall back to the slug only for a title that slugified to nothing. */
  private cardNameFor(title: string, slug: string): string {
    return title.length > 0 ? title : slugToName(slug);
  }

  private toForgeDto(order: GenerationOrderEntity, candidates: GenerationOrderCandidateEntity[]): ForgeGenerationOrderDto {
    return { id: order.id, runId: order.runId!, brief: order.brief, archetype: order.archetype, element: order.element,
      suggestedRarity: order.suggestedRarity, recipeProfile: order.recipeProfile,
      candidates: candidates.map((candidate) => ({ id: candidate.id, index: candidate.index, slug: candidate.slug, seed: String(candidate.seed) })),
    };
  }
  private toDto(order: GenerationOrderEntity, cards: Map<string, CardEntity>): GenerationOrderDto {
    return { id: order.id, status: order.status, title: order.title, brief: order.brief, archetype: order.archetype,
      element: order.element, suggestedRarity: order.suggestedRarity, candidateCount: order.candidateCount, setId: order.setId,
      recipeProfile: order.recipeProfile, createdByPlayerId: order.createdByPlayerId, createdAt: order.createdAt.toISOString(),
      readyAt: order.readyAt?.toISOString() ?? null, generatedAt: order.generatedAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null, failureCode: order.failureCode, failureDetail: order.failureDetail,
      candidates: [...(order.candidates ?? [])].sort((a, b) => a.index - b.index).map((candidate) => {
        const card = candidate.cardId ? cards.get(candidate.cardId) : undefined;
        return {
          id: candidate.id, index: candidate.index, slug: candidate.slug, seed: String(candidate.seed),
          status: candidate.status, cardId: candidate.cardId,
          thumbUrl: card ? this.cardMapper.toUrl(card.thumbPath) : null,
          cardName: card?.name ?? null,
        };
      }),
    };
  }
}
