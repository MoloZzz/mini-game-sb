import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { RARITIES, WINNING_INDEX } from '@card-game/shared-types';
import type { Balance, OpenCaseResponse, Rarity, ReelTileDto } from '@card-game/shared-types';
import type { DataSource, EntityManager } from 'typeorm';
import { In, IsNull } from 'typeorm';
import { CardMapper } from '../cards/card.mapper';
import { apiError, throwCaseNotFound } from '../common/api-error';
import {
  CardEntity,
  CaseEntity,
  CaseOpeningEntity,
  PlayerCardEntity,
  PlayerEntity,
} from '../entities';
import { LedgerService } from '../ledger/ledger.service';
import { MilestoneService } from '../milestones/milestone.service';
import type { FillerPool, ReelCard } from './build-reel';
import { buildReel } from './build-reel';
import { nextPityCounter } from './pity';
import { createCryptoRng } from './rng';
import { rollRarity } from './roll-rarity';

/** Bounds the reel-filler queries so they stay cheap regardless of pool size. */
const FILLER_POOL_CAP_PER_RARITY = 40;

/**
 * `POST /cases/:slug/open` — the heart of the game (vault 03). Everything
 * happens inside ONE Postgres transaction, player row locked FIRST via
 * `SELECT ... FOR UPDATE`, so a double-click can never open two cases for one
 * key/coin balance (that lock is the entire reason this method is
 * transactional at all — never read the balance before taking it).
 */
@Injectable()
export class DropsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cardMapper: CardMapper,
    private readonly ledgerService: LedgerService,
    private readonly milestoneService: MilestoneService,
  ) {}

  async openCase(
    playerId: string,
    slug: string,
    clientSeed: string | null,
    idempotencyKey: string | null,
  ): Promise<OpenCaseResponse> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock the player row FIRST, before reading/checking the balance.
      const player = await manager
        .createQueryBuilder(PlayerEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: playerId })
        .getOne();

      if (!player) {
        apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
      }

      // 2. Idempotency replay: same key -> same response, no re-charge.
      if (idempotencyKey) {
        const existingOpening = await manager.findOne(CaseOpeningEntity, {
          where: { playerId: player.id, idempotencyKey },
        });
        if (existingOpening) {
          return this.buildReplayResponse(manager, existingOpening, player);
        }
      }

      // 3. Load the case.
      const caseEntity = await manager.findOne(CaseEntity, { where: { slug } });
      if (!caseEntity) {
        throwCaseNotFound(slug);
      }
      if (!caseEntity.isActive) {
        apiError(409, 'CASE_INACTIVE', `Case "${slug}" is not active`, { slug });
      }

      // 4. Check funds — a case costs EITHER coins OR keys, never both.
      const have: Balance = { coins: player.balanceCoins, keys: player.balanceKeys };
      const { priceCoins, priceKeys } = caseEntity;

      if (priceCoins != null && player.balanceCoins < priceCoins) {
        apiError(402, 'INSUFFICIENT_FUNDS', 'Not enough coins to open this case', {
          need: { coins: priceCoins },
          have,
        });
      }
      if (priceKeys != null && player.balanceKeys < priceKeys) {
        apiError(402, 'INSUFFICIENT_FUNDS', 'Not enough keys to open this case', {
          need: { keys: priceKeys },
          have,
        });
      }

      // 5. Debit the player entity in memory (persisted together with the
      // pity update at the end of the transaction).
      const deltaCoins = priceCoins != null ? -priceCoins : 0;
      const deltaKeys = priceKeys != null ? -priceKeys : 0;
      player.balanceCoins += deltaCoins;
      player.balanceKeys += deltaKeys;

      // 6. Availability: which rarities actually have >= 1 approved card.
      const availableRarities = await this.loadAvailableRarities(manager, caseEntity.setId);

      // 7. Roll the rarity via the pure engine (crypto RNG only).
      const rng = createCryptoRng();
      const rolledRarity = rollRarity({
        weights: caseEntity.rarityWeights,
        pityCounter: player.pityCounter,
        availableRarities,
        rng,
      });

      if (rolledRarity === null) {
        apiError(409, 'EMPTY_POOL', 'No approved cards are available to drop', {
          rarity: null,
        });
      }

      // 8. Pick the winning card uniformly among approved cards of that rarity.
      const candidates = await manager.find(CardEntity, {
        where: { status: 'approved', rarity: rolledRarity, ...(caseEntity.setId ? { setId: caseEntity.setId } : {}) },
      });
      if (candidates.length === 0) {
        apiError(409, 'EMPTY_POOL', `No approved cards of rarity "${rolledRarity}"`, {
          rarity: rolledRarity,
        });
      }
      const winnerEntity = rng.pick(candidates);
      const winnerTile: ReelCard = this.cardMapper.toReelTile(winnerEntity);

      // 9. Build the filler pool and the 60-tile reel around the winner.
      const pool = await this.loadFillerPool(manager, caseEntity.setId);
      const reel: ReelTileDto[] = buildReel({ winner: winnerTile, pool, rng });

      // 10. Insert case_openings.
      const openingsSoFar = await manager.count(CaseOpeningEntity, {
        where: { playerId: player.id },
      });
      const opening = manager.create(CaseOpeningEntity, {
        playerId: player.id,
        caseId: caseEntity.id,
        wonCardId: winnerEntity.id,
        reel: reel.map((tile) => tile.id),
        winningIndex: WINNING_INDEX,
        serverSeed: randomBytes(32).toString('hex'),
        clientSeed,
        nonce: openingsSoFar + 1,
        idempotencyKey,
      });
      const savedOpening = await manager.save(opening);

      // 11. Insert player_cards — ADR-012: one row per instance, never quantity.
      const playerCard = manager.create(PlayerCardEntity, {
        playerId: player.id,
        cardId: winnerEntity.id,
        dropId: savedOpening.id,
        soldAt: null,
      });
      await manager.save(playerCard);

      // 12. Copies of the won card the player owns after this drop. Moved up
      // from after the final save (economy fix, part 1): the unique-card
      // count can only change on the FIRST copy, so `copies === 1` is
      // exactly the signal that gates the milestone check below — on a
      // duplicate drop the entire milestone path is skipped.
      const copies = await manager.count(PlayerCardEntity, {
        where: { playerId: player.id, cardId: winnerEntity.id, soldAt: IsNull() },
      });

      // 13. Insert the ledger row (ADR-008 — every balance change goes through it).
      await this.ledgerService.recordTransaction(manager, {
        playerId: player.id,
        type: 'case_open',
        deltaCoins,
        deltaKeys,
        refType: 'case_opening',
        refId: savedOpening.id,
      });

      // 14. Update pity.
      player.pityCounter = nextPityCounter(player.pityCounter, rolledRarity);

      // 15. Collection milestones (economy fix, part 1): only a NEW unique
      // card can cross a threshold, so this only runs on `copies === 1`.
      // Mutates `player`'s in-memory balance in place; persisted together
      // with the debit and the pity update by the single `manager.save`
      // below, so milestone coins/keys and the balance commit atomically.
      if (copies === 1) {
        await this.milestoneService.checkAndAward(manager, player);
      }

      // 16. Persist the player (balance + pity + any milestone reward, one row).
      await manager.save(player);

      return {
        dropId: savedOpening.id,
        reel,
        winningIndex: savedOpening.winningIndex,
        wonCard: this.cardMapper.toCardDto(winnerEntity),
        isDuplicate: copies > 1,
        copies,
        balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      };
    });
  }

  private async loadAvailableRarities(manager: EntityManager, setId: string | null): Promise<Set<Rarity>> {
    const rows = await manager
      .createQueryBuilder(CardEntity, 'c')
      .select('DISTINCT c.rarity', 'rarity')
      .where("c.status = 'approved'")
      .andWhere(setId ? 'c.set_id = :setId' : '1 = 1', { setId })
      .getRawMany<{ rarity: Rarity }>();
    return new Set(rows.map((row) => row.rarity));
  }

  /** Six bounded queries — one per rarity — so the reel query stays cheap. */
  private async loadFillerPool(manager: EntityManager, setId: string | null): Promise<FillerPool> {
    const pool: Partial<Record<Rarity, ReelCard[]>> = {};
    for (const rarity of RARITIES) {
      const cards = await manager.find(CardEntity, {
        where: { status: 'approved', rarity, ...(setId ? { setId } : {}) },
        take: FILLER_POOL_CAP_PER_RARITY,
      });
      pool[rarity] = cards.map((card) => this.cardMapper.toReelTile(card));
    }
    return pool;
  }

  /**
   * Idempotent replay: rebuilds the exact response of a previous opening from
   * the stored `case_openings` row, using the player's CURRENT balance (no
   * re-charge). `isDuplicate`/`copies` are recomputed live since they are not
   * stored on the opening row itself.
   */
  private async buildReplayResponse(
    manager: EntityManager,
    opening: CaseOpeningEntity,
    player: PlayerEntity,
  ): Promise<OpenCaseResponse> {
    const uniqueIds = Array.from(new Set(opening.reel));
    const cards = await manager.find(CardEntity, { where: { id: In(uniqueIds) } });
    const cardById = new Map(cards.map((card) => [card.id, card]));

    const reel: ReelTileDto[] = opening.reel.map((id) => {
      const card = cardById.get(id);
      if (!card) {
        throw new Error(`Idempotency replay: reel card ${id} no longer exists`);
      }
      return this.cardMapper.toReelTile(card);
    });

    const wonCardEntity =
      cardById.get(opening.wonCardId) ??
      (await manager.findOneOrFail(CardEntity, { where: { id: opening.wonCardId } }));

    const copies = await manager.count(PlayerCardEntity, {
      where: { playerId: player.id, cardId: opening.wonCardId, soldAt: IsNull() },
    });

    return {
      dropId: opening.id,
      reel,
      winningIndex: opening.winningIndex,
      wonCard: this.cardMapper.toCardDto(wonCardEntity),
      isDuplicate: copies > 1,
      copies,
      balance: { coins: player.balanceCoins, keys: player.balanceKeys },
    };
  }
}
