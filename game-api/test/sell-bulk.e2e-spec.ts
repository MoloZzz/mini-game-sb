import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RARITY_META } from '@card-game/shared-types';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config/configuration';
import { PlayerEntity } from '../src/entities';
import { createTestPlayer, deleteTestPlayers } from './auth.helper';

/**
 * Runs against the isolated `cardgame_test` database (see test/env.setup.ts),
 * never the dev database. Follows the exact bootstrap / fixture / teardown
 * conventions of `inventory-economy.e2e-spec.ts` and
 * `ledger-invariant.e2e-spec.ts`: its own registered player (route sits
 * behind the global `JwtAuthGuard`), a namespaced email prefix, and a
 * `resetPlayerState` that re-baselines both the player row and the ledger
 * with a single synthetic `initial_grant` transaction.
 *
 * Instead of grinding through hundreds of `POST /cases/:slug/open` calls to
 * accumulate duplicates (slow and non-deterministic), `seedDuplicates`
 * inserts `player_cards` rows directly for an already-approved card id, with
 * explicit, strictly increasing `acquired_at` timestamps so "oldest first"
 * ordering is deterministic. This is legitimate here because `sellBulk`'s
 * behavior only depends on the `player_cards` rows existing with a real
 * `card_id` FK and a well-defined acquisition order — not on how they were
 * created — exactly like `resetPlayerState` below writing `transactions`
 * rows directly.
 */
describe('POST /api/me/inventory/sell-bulk (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let playerId: string;
  let token: string;

  const EMAIL_PREFIX = 'test-sell-bulk';
  const ORIGINAL_BALANCE_COINS = 1000;
  const ORIGINAL_BALANCE_KEYS = 5;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();

    const configService = app.get(ConfigService<AppConfig, true>);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableCors({ origin: true });
    const storageDir = configService.get('storageDir', { infer: true });
    app.useStaticAssets(storageDir, { prefix: '/static' });

    await app.init();

    dataSource = app.get(getDataSourceToken());

    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    const account = await createTestPlayer(app, { emailPrefix: EMAIL_PREFIX });
    playerId = account.playerId;
    token = account.token;

    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS);
  });

  // Wrapped in a single `dataSource.transaction()` — with the deferred
  // ledger-invariant constraint trigger live on `players` (see
  // AddLedgerInvariantTrigger1785200000002), running these as separate
  // implicit transactions would let the `UPDATE players` commit be checked
  // against a ledger the preceding `DELETE FROM transactions` had just
  // emptied. One transaction means the deferred check only ever sees the
  // final, consistent state at COMMIT.
  async function resetPlayerState(coins: number, keys: number): Promise<void> {
    await dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM player_cards WHERE player_id = $1', [playerId]);
      await manager.query('DELETE FROM case_openings WHERE player_id = $1', [playerId]);
      await manager.query('DELETE FROM transactions WHERE player_id = $1', [playerId]);
      await manager.getRepository(PlayerEntity).update(playerId, {
        balanceCoins: coins,
        balanceKeys: keys,
        pityCounter: 0,
        lastDailyClaimAt: null,
      });
      await manager.query(
        `INSERT INTO transactions (player_id, type, delta_coins, delta_keys, ref_type, ref_id)
         VALUES ($1, 'initial_grant', $2, $3, 'e2e-test-reset', NULL)`,
        [playerId, coins, keys],
      );
    });
  }

  afterEach(async () => {
    await resetPlayerState(ORIGINAL_BALANCE_COINS, ORIGINAL_BALANCE_KEYS);
  });

  afterAll(async () => {
    await deleteTestPlayers(dataSource, EMAIL_PREFIX);
    await app.close();
  });

  /**
   * `n` distinct approved card ids, stable order. `sellBulk` never cares
   * which card is which — only that duplicates share a real `card_id` FK —
   * so any `n` approved cards from the shared test-db pool work as fixtures.
   */
  async function getApprovedCardIds(n: number): Promise<Array<{ id: string; rarity: string }>> {
    const rows: Array<{ id: string; rarity: string }> = await dataSource.query(
      `SELECT id, rarity FROM cards WHERE status = 'approved' ORDER BY id ASC LIMIT $1`,
      [n],
    );
    if (rows.length < n) {
      throw new Error(
        `sell-bulk e2e needs at least ${n} approved cards in cardgame_test; found ${rows.length}. ` +
          `Seed more via 'npm run seed -- --placeholder-cards N'.`,
      );
    }
    return rows;
  }

  /** One approved card id per distinct rarity present, up to `n` rarities. */
  async function getApprovedCardsAcrossRarities(
    n: number,
  ): Promise<Array<{ id: string; rarity: string }>> {
    const rows: Array<{ id: string; rarity: string }> = await dataSource.query(
      `SELECT DISTINCT ON (rarity) id, rarity FROM cards WHERE status = 'approved' ORDER BY rarity, id ASC`,
    );
    if (rows.length < n) {
      throw new Error(
        `sell-bulk e2e needs approved cards spanning at least ${n} distinct rarities; found ${rows.length}.`,
      );
    }
    return rows.slice(0, n);
  }

  /**
   * Inserts `count` unsold `player_cards` rows for `cardId`, each one second
   * further back than the last, then returns their ids ordered oldest-first
   * — the same order `resolveSellableInstances` selects in. The LAST id in
   * the returned array is always the newest copy, i.e. the one `sellBulk`
   * must never sell.
   */
  async function seedDuplicates(cardId: string, count: number): Promise<string[]> {
    await dataSource.query(
      `INSERT INTO player_cards (player_id, card_id, drop_id, acquired_at, sold_at)
       SELECT $1, $2, NULL, now() - (($3::int - gs) || ' seconds')::interval, NULL
       FROM generate_series(1, $3::int) AS gs`,
      [playerId, cardId, count],
    );
    const rows: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM player_cards
       WHERE player_id = $1 AND card_id = $2 AND sold_at IS NULL
       ORDER BY acquired_at ASC, id ASC`,
      [playerId, cardId],
    );
    return rows.map((r) => r.id);
  }

  /** Cards this player owns that have been fully depleted (zero unsold copies left). */
  async function cardsWithZeroUnsold(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT pc.card_id
       FROM player_cards pc
       WHERE pc.player_id = $1
       GROUP BY pc.card_id
       HAVING COUNT(*) FILTER (WHERE pc.sold_at IS NULL) = 0`,
      [playerId],
    );
  }

  async function cardSellLedgerRows(): Promise<
    Array<{ delta_coins: string; ref_id: string }>
  > {
    return dataSource.query(
      `SELECT delta_coins, ref_id FROM transactions WHERE player_id = $1 AND type = 'card_sell'`,
      [playerId],
    );
  }

  async function ledgerInvariantViolations(): Promise<unknown[]> {
    return dataSource.query(
      `SELECT p.id FROM players p JOIN transactions t ON t.player_id = p.id
       WHERE p.id = $1
       GROUP BY p.id, p.balance_coins HAVING p.balance_coins <> SUM(t.delta_coins)`,
      [playerId],
    );
  }

  function sellBulk(body: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post('/api/me/inventory/sell-bulk')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('never sells the last copy: cards with 1/2/5 copies each keep exactly one unsold instance after mode=all_duplicates', async () => {
    const [cardA, cardB, cardC] = await getApprovedCardIds(3);

    const idsA = await seedDuplicates(cardA!.id, 1); // no duplicates — must be untouched
    const idsB = await seedDuplicates(cardB!.id, 2);
    const idsC = await seedDuplicates(cardC!.id, 5);

    const res = await sellBulk({ mode: 'all_duplicates' });
    expect(res.status).toBe(200);
    expect(res.body.soldCount).toBe(0 + 1 + 4); // (1-1) + (2-1) + (5-1)

    // Every card is still represented by at least one unsold instance.
    expect(await cardsWithZeroUnsold()).toEqual([]);

    const unsoldA = await dataSource.query(
      'SELECT id FROM player_cards WHERE card_id = $1 AND player_id = $2 AND sold_at IS NULL',
      [cardA!.id, playerId],
    );
    expect(unsoldA.map((r: { id: string }) => r.id)).toEqual(idsA);

    const unsoldB = await dataSource.query(
      'SELECT id FROM player_cards WHERE card_id = $1 AND player_id = $2 AND sold_at IS NULL',
      [cardB!.id, playerId],
    );
    expect(unsoldB.map((r: { id: string }) => r.id)).toEqual([idsB[idsB.length - 1]]);

    const unsoldC = await dataSource.query(
      'SELECT id FROM player_cards WHERE card_id = $1 AND player_id = $2 AND sold_at IS NULL',
      [cardC!.id, playerId],
    );
    expect(unsoldC.map((r: { id: string }) => r.id)).toEqual([idsC[idsC.length - 1]]);
  });

  it('soldCount equals exactly the number of new ledger rows created, each row matching a sold instance and its rarity sellValue', async () => {
    const [cardA, cardB] = await getApprovedCardIds(2);
    const idsA = await seedDuplicates(cardA!.id, 4);
    const idsB = await seedDuplicates(cardB!.id, 3);

    const res = await sellBulk({ mode: 'all_duplicates' });
    expect(res.status).toBe(200);

    const ledgerRows = await cardSellLedgerRows();
    expect(ledgerRows.length).toBe(res.body.soldCount);
    expect(res.body.soldCount).toBe(3 + 2); // (4-1) + (3-1)

    const soldIds = new Set([...idsA.slice(0, -1), ...idsB.slice(0, -1)]);
    expect(new Set(ledgerRows.map((r) => r.ref_id))).toEqual(soldIds);

    const totalDelta = ledgerRows.reduce((sum, r) => sum + Number(r.delta_coins), 0);
    expect(totalDelta).toBe(res.body.gained.coins);
    expect(res.body.gained.coins).toBe(
      3 * RARITY_META[cardA!.rarity as keyof typeof RARITY_META].sellValue +
        2 * RARITY_META[cardB!.rarity as keyof typeof RARITY_META].sellValue,
    );

    const player = await dataSource
      .getRepository(PlayerEntity)
      .findOneOrFail({ where: { id: playerId } });
    expect(player.balanceCoins).toBe(ORIGINAL_BALANCE_COINS + res.body.gained.coins);
  });

  it('replaying the identical request returns soldCount: 0 and creates no further ledger rows', async () => {
    const [cardA] = await getApprovedCardIds(1);
    await seedDuplicates(cardA!.id, 4);

    const first = await sellBulk({ mode: 'all_duplicates' });
    expect(first.status).toBe(200);
    expect(first.body.soldCount).toBe(3);

    const ledgerAfterFirst = await cardSellLedgerRows();
    expect(ledgerAfterFirst.length).toBe(3);

    const second = await sellBulk({ mode: 'all_duplicates' });
    expect(second.status).toBe(200);
    expect(second.body.soldCount).toBe(0);
    expect(second.body.gained.coins).toBe(0);

    const ledgerAfterSecond = await cardSellLedgerRows();
    expect(ledgerAfterSecond.length).toBe(3);
  });

  it('mode "by_rarity" sells only duplicates of the requested rarity, leaving other rarities untouched', async () => {
    const [rarityCardA, rarityCardB] = await getApprovedCardsAcrossRarities(2);
    const idsA = await seedDuplicates(rarityCardA!.id, 3);
    const idsB = await seedDuplicates(rarityCardB!.id, 3);

    const res = await sellBulk({ mode: 'by_rarity', rarities: [rarityCardA!.rarity] });
    expect(res.status).toBe(200);
    expect(res.body.soldCount).toBe(2); // only card A's (3-1) duplicates

    const unsoldA = await dataSource.query(
      'SELECT id FROM player_cards WHERE card_id = $1 AND sold_at IS NULL',
      [rarityCardA!.id],
    );
    expect(unsoldA.map((r: { id: string }) => r.id)).toEqual([idsA[idsA.length - 1]]);

    // Card B (different rarity) is completely untouched.
    const unsoldB = await dataSource.query(
      'SELECT id FROM player_cards WHERE card_id = $1 AND sold_at IS NULL',
      [rarityCardB!.id],
    );
    expect(unsoldB.map((r: { id: string }) => r.id).sort()).toEqual([...idsB].sort());
  });

  it('mode instanceIds sells the requested instances, silently dropping any that resolve to the last copy of their card', async () => {
    const [cardA, cardB] = await getApprovedCardIds(2);
    const idsA = await seedDuplicates(cardA!.id, 3); // 2 sellable + 1 last-copy
    const idsB = await seedDuplicates(cardB!.id, 1); // single copy -> always last-copy

    // Request every id of card A (including its last copy) plus card B's
    // only (last-copy) instance.
    const requested = [...idsA, ...idsB];

    const res = await sellBulk({ instanceIds: requested });
    expect(res.status).toBe(200);
    expect(res.body.soldCount).toBe(2); // idsA's two oldest only

    const soldA = await dataSource.query(
      'SELECT id, sold_at FROM player_cards WHERE id = ANY($1)',
      [idsA.slice(0, -1)],
    );
    for (const row of soldA) {
      expect(row.sold_at).not.toBeNull();
    }

    const lastCopyA = await dataSource.query('SELECT sold_at FROM player_cards WHERE id = $1', [
      idsA[idsA.length - 1],
    ]);
    expect(lastCopyA[0].sold_at).toBeNull();

    const cardBRow = await dataSource.query('SELECT sold_at FROM player_cards WHERE id = $1', [
      idsB[0],
    ]);
    expect(cardBRow[0].sold_at).toBeNull();

    expect(await cardsWithZeroUnsold()).toEqual([]);
  });

  it(
    'ledger invariant SUM(delta_coins) == balance_coins still holds after selling 100+ instances in one request',
    async () => {
      const cards = await getApprovedCardIds(3);
      const seeded: Array<{ ids: string[] }> = [];
      for (const card of cards) {
        seeded.push({ ids: await seedDuplicates(card.id, 40) }); // 3 * 40 = 120 rows
      }

      const res = await sellBulk({ mode: 'all_duplicates' });
      expect(res.status).toBe(200);
      expect(res.body.soldCount).toBe(3 * 39); // 117, well over 100
      expect(res.body.soldCount).toBeGreaterThan(100);

      const ledgerRows = await cardSellLedgerRows();
      expect(ledgerRows.length).toBe(res.body.soldCount);

      expect(await ledgerInvariantViolations()).toEqual([]);

      // Every card still has exactly its one newest copy left unsold.
      for (const { ids } of seeded) {
        const unsold = await dataSource.query(
          'SELECT id FROM player_cards WHERE id = ANY($1) AND sold_at IS NULL',
          [ids],
        );
        expect(unsold).toHaveLength(1);
        expect(unsold[0].id).toBe(ids[ids.length - 1]);
      }
    },
    60_000,
  );
});
