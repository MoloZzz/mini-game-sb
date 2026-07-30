import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ARCHETYPE_RARITIES } from '@card-game/shared-types';
import type { CompleteGenerationOrderRequest, CreateGenerationOrderRequest, ForgeGenerationOrderDto, GenerationOrderDto, SelectGenerationOrderCandidateRequest, UpdateGenerationOrderRequest } from '@card-game/shared-types';
import { randomInt, randomUUID } from 'crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { apiError } from '../common/api-error';
import { CardEntity, GenerationOrderCandidateEntity, GenerationOrderEntity } from '../entities';
import { PoolService } from '../collection/pool.service';
import { autofillStats } from './stat-autofill';

@Injectable()
export class GenerationOrdersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource, private readonly poolService: PoolService) {}

  async create(createdByPlayerId: string, input: CreateGenerationOrderRequest): Promise<GenerationOrderDto> {
    this.assertArchetypeRarity(input.archetype, input.suggestedRarity);
    const candidateCount = input.candidateCount ?? 4;
    const order = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(manager.create(GenerationOrderEntity, {
        status: 'draft', title: input.title.trim(), brief: input.brief.trim(), archetype: input.archetype,
        element: input.element ?? null, suggestedRarity: input.suggestedRarity, candidateCount,
        setId: input.setId ?? null, recipeProfile: 'card-v1', createdByPlayerId,
        readyAt: null, generatedAt: null, completedAt: null, failureCode: null, failureDetail: null, runId: null,
      }));
      const candidates = this.createCandidates(manager, created.id, candidateCount);
      await manager.save(candidates);
      created.candidates = candidates;
      return created;
    });
    return this.toDto(order);
  }

  async list(): Promise<GenerationOrderDto[]> {
    const orders = await this.dataSource.getRepository(GenerationOrderEntity).find({ relations: { candidates: true }, order: { createdAt: 'DESC' } });
    return orders.map((order) => this.toDto(order));
  }

  async get(id: string): Promise<GenerationOrderDto> {
    return this.toDto(await this.findOrder(id));
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
      if (input.candidateCount !== undefined && input.candidateCount !== order.candidateCount) {
        await manager.delete(GenerationOrderCandidateEntity, { orderId: order.id });
        order.candidateCount = input.candidateCount;
        await manager.save(this.createCandidates(manager, order.id, order.candidateCount));
      }
      await manager.save(order);
    });
    return this.get(id);
  }

  async cancel(id: string): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['draft', 'ready']);
      order.status = 'cancelled'; await manager.save(order);
    });
    return this.get(id);
  }

  async queue(id: string): Promise<GenerationOrderDto> {
    const order = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockOrder(manager, id);
      this.assertState(current, ['draft']);
      current.status = 'ready'; current.readyAt = new Date(); current.failureCode = null; current.failureDetail = null;
      return manager.save(current);
    });
    return this.toDto(await this.findOrder(order.id));
  }

  async retry(id: string): Promise<GenerationOrderDto> {
    const order = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockOrder(manager, id);
      this.assertState(current, ['failed']);
      current.status = 'ready'; current.runId = null; current.readyAt = new Date(); current.failureCode = null; current.failureDetail = null;
      return manager.save(current);
    });
    return this.toDto(await this.findOrder(order.id));
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
      if (order.status === 'review') return;
      this.assertState(order, ['generating']);
      if (order.runId !== input.runId) apiError(409, 'GENERATION_RUN_CONFLICT', 'The forge run does not own this order');
      const planned = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: id }, order: { index: 'ASC' } });
      if (planned.length !== input.candidates.length) apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidate count does not match the order');
      const byId = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
      if (byId.size !== planned.length || planned.some((candidate) => !byId.has(candidate.id))) {
        apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidates do not match this order');
      }
      for (const candidate of planned) {
        const output = byId.get(candidate.id)!;
        this.assertRelativePath(output.imagePath); this.assertRelativePath(output.thumbPath);
        if (Number(output.genMeta.seed) !== Number(candidate.seed)) {
          apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Candidate seed does not match the planned seed');
        }
        const card = await manager.save(manager.create(CardEntity, {
          slug: candidate.slug, name: candidate.slug.replace(/-/g, ' '), flavorText: null,
          rarity: order.suggestedRarity, element: order.element, archetype: order.archetype,
          attack: 0, defense: 0, imagePath: output.imagePath, thumbPath: output.thumbPath, status: 'draft', setId: order.setId,
          genMeta: { ...output.genMeta, generationOrder: { orderId: order.id, candidateId: candidate.id, promptTemplateVersion: order.recipeProfile } },
        }));
        candidate.cardId = card.id; candidate.status = 'generated'; await manager.save(candidate);
      }
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

  async select(id: string, input: SelectGenerationOrderCandidateRequest): Promise<GenerationOrderDto> {
    await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, id);
      this.assertState(order, ['review']);
      const candidates = await manager.find(GenerationOrderCandidateEntity, { where: { orderId: id } });
      const selected = candidates.find((candidate) => candidate.id === input.candidateId && candidate.cardId);
      if (!selected?.cardId) apiError(400, 'GENERATION_CANDIDATE_MISMATCH', 'Selected candidate is not generated for this order');
      const card = await manager.findOneBy(CardEntity, { id: selected.cardId });
      if (!card || card.status !== 'draft') apiError(409, 'INVALID_GENERATION_ORDER_STATE', 'Selected card is no longer a draft');
      const rarity = input.rarity ?? card.rarity;
      this.assertArchetypeRarity(card.archetype, rarity);
      card.name = input.name.trim(); card.rarity = rarity; card.flavorText = input.flavorText ?? null;
      if (input.attack !== undefined) card.attack = input.attack;
      if (input.defense !== undefined) card.defense = input.defense;
      if (input.attack === undefined && input.defense === undefined && card.attack === 0 && card.defense === 0) {
        Object.assign(card, autofillStats(card.rarity));
      }
      card.status = 'approved'; await manager.save(card);
      for (const candidate of candidates) {
        candidate.status = candidate.id === selected.id ? 'selected' : 'discarded';
        await manager.save(candidate);
        if (candidate.id !== selected.id && candidate.cardId) await manager.update(CardEntity, candidate.cardId, { status: 'rejected' });
      }
      order.status = 'completed'; order.completedAt = new Date(); await manager.save(order);
    });
    this.poolService.invalidate();
    return this.get(id);
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
  private createCandidates(manager: EntityManager, orderId: string, count: number): GenerationOrderCandidateEntity[] {
    return Array.from({ length: count }, (_, index) => manager.create(GenerationOrderCandidateEntity, {
      orderId, index: index + 1, slug: `order-${orderId}-${index + 1}`,
      seed: String(randomInt(1, 2_147_483_647)), status: 'planned', cardId: null,
    }));
  }
  private toForgeDto(order: GenerationOrderEntity, candidates: GenerationOrderCandidateEntity[]): ForgeGenerationOrderDto {
    return { id: order.id, runId: order.runId!, brief: order.brief, archetype: order.archetype, element: order.element,
      suggestedRarity: order.suggestedRarity, recipeProfile: order.recipeProfile,
      candidates: candidates.map((candidate) => ({ id: candidate.id, index: candidate.index, slug: candidate.slug, seed: String(candidate.seed) })),
    };
  }
  private toDto(order: GenerationOrderEntity): GenerationOrderDto {
    return { id: order.id, status: order.status, title: order.title, brief: order.brief, archetype: order.archetype,
      element: order.element, suggestedRarity: order.suggestedRarity, candidateCount: order.candidateCount, setId: order.setId,
      recipeProfile: order.recipeProfile, createdByPlayerId: order.createdByPlayerId, createdAt: order.createdAt.toISOString(),
      readyAt: order.readyAt?.toISOString() ?? null, generatedAt: order.generatedAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null, failureCode: order.failureCode,
      candidates: [...(order.candidates ?? [])].sort((a, b) => a.index - b.index).map((candidate) => ({ id: candidate.id, index: candidate.index, slug: candidate.slug, seed: String(candidate.seed), status: candidate.status, cardId: candidate.cardId })),
    };
  }
}
