import 'reflect-metadata';
import {
  ARCHETYPES,
  CASE_SEEDS,
  ELEMENTS,
  INITIAL_GRANT,
  POOL_SEED_RATIOS,
  RARITIES,
  RARITY_META,
  weightsSumTo100,
} from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';
import { randomInt } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { DataSource } from 'typeorm';
import { hashPassword } from '../auth/password.util';
import configuration from '../config/configuration';
import { AppDataSource } from '../database/data-source';
import { CardEntity, CaseEntity, PlayerEntity, TransactionEntity } from '../entities';
import { createSolidColorPng } from './placeholder-image';

/**
 * Standalone seeding CLI — `npm run seed -- [--reset] [--placeholder-cards N]`.
 * Not an HTTP endpoint. Safe to re-run without `--reset`: the player, all
 * cases in `CASE_SEEDS` (nine, as of the archetype/case-roster widening),
 * and any previously-seeded placeholder cards are matched by a stable key
 * (display name / slug) and never duplicated.
 */

interface SeedArgs {
  placeholderCards: number;
  reset: boolean;
}

function parseArgs(argv: string[]): SeedArgs {
  let placeholderCards = 0;
  let reset = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--placeholder-cards') {
      const raw = argv[++i];
      const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
      placeholderCards = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } else if (arg === '--reset') {
      reset = true;
    }
  }

  return { placeholderCards, reset };
}

function randomElementOf<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)]!;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Sum of `POOL_SEED_RATIOS` — the denominator for the proportional split below. */
const POOL_SEED_RATIO_TOTAL = RARITIES.reduce((sum, r) => sum + POOL_SEED_RATIOS[r], 0);

/**
 * Spreads N placeholder cards across all six rarities proportionally to
 * `POOL_SEED_RATIOS` (180/108/64/35/30/15) — the synthetic placeholder
 * pool's shape, NOT the real approved-card pool (see the doc comment on
 * `POOL_SEED_RATIOS`). Every rarity gets at least one card once N >= 6 (the
 * number of rarities): each rarity is seeded with a floor of 1, then the
 * remainder is distributed by the largest-remainder method so the total
 * always equals N exactly.
 */
function allocateRarityCounts(n: number): Record<Rarity, number> {
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  if (n <= 0) return counts;

  if (n < RARITIES.length) {
    for (let i = 0; i < n; i++) {
      counts[RARITIES[i]!] += 1;
    }
    return counts;
  }

  for (const r of RARITIES) counts[r] = 1;
  const remaining = n - RARITIES.length;

  const fracParts: Array<{ rarity: Rarity; frac: number }> = [];
  let flooredSum = 0;
  for (const r of RARITIES) {
    const exact = (remaining * POOL_SEED_RATIOS[r]) / POOL_SEED_RATIO_TOTAL;
    const floor = Math.floor(exact);
    counts[r] += floor;
    flooredSum += floor;
    fracParts.push({ rarity: r, frac: exact - floor });
  }

  let leftover = remaining - flooredSum;
  fracParts.sort((a, b) => b.frac - a.frac);
  for (let i = 0; leftover > 0; i++, leftover--) {
    counts[fracParts[i % fracParts.length]!.rarity] += 1;
  }

  return counts;
}

/**
 * Only creates a player when BOTH `SEED_PLAYER_EMAIL` and
 * `SEED_PLAYER_PASSWORD` are set — a fresh database is otherwise left with
 * no player row at all, rather than one nobody can ever bind or log into
 * (a bare, unbound `players` row created here would have no email/password
 * for `npm run account:bind` to match against by anything but `--player`/
 * `--id`, but more importantly there would be no way to know it exists
 * without already knowing the seed script's internals). When either env
 * var is missing, seed no player and point at `npm run account:bind`
 * for binding one manually later.
 */
async function seedPlayer(dataSource: DataSource): Promise<void> {
  const playerRepo = dataSource.getRepository(PlayerEntity);
  const existing = await playerRepo.findOne({ where: { displayName: 'Molo' } });
  if (existing) {
    console.log('Player "Molo" already exists — skipping.');
    return;
  }

  const email = process.env.SEED_PLAYER_EMAIL;
  const password = process.env.SEED_PLAYER_PASSWORD;

  if (!email || !password) {
    console.log(
      'SEED_PLAYER_EMAIL / SEED_PLAYER_PASSWORD not both set — creating no player. ' +
        'Bind an existing player later with, e.g.: ' +
        'echo "yourpassword" | npm run account:bind -- --player "Molo" --email you@example.com --role admin',
    );
    return;
  }

  const passwordHash = await hashPassword(password);

  await dataSource.transaction(async (manager) => {
    const player = manager.create(PlayerEntity, {
      displayName: 'Molo',
      email: email.toLowerCase(),
      passwordHash,
      role: 'player',
      balanceCoins: INITIAL_GRANT.coins,
      balanceKeys: INITIAL_GRANT.keys,
      pityCounter: 0,
      lastDailyClaimAt: null,
    });
    const savedPlayer = await manager.save(player);

    // Without this row the ledger invariant SUM(delta_coins) == balance_coins
    // is violated from the first second (vault 02 / ADR-008).
    const grantTx = manager.create(TransactionEntity, {
      playerId: savedPlayer.id,
      type: 'initial_grant',
      deltaCoins: INITIAL_GRANT.coins,
      deltaKeys: INITIAL_GRANT.keys,
      refType: 'player',
      refId: savedPlayer.id,
    });
    await manager.save(grantTx);
  });

  console.log(
    `Seeded player "Molo" (1000 coins, 5 keys, bound to ${email.toLowerCase()}) + initial_grant transaction.`,
  );
}

async function seedCases(dataSource: DataSource): Promise<void> {
  const caseRepo = dataSource.getRepository(CaseEntity);

  for (const seed of CASE_SEEDS) {
    if (!weightsSumTo100(seed.weights)) {
      throw new Error(`Case "${seed.slug}" rarity weights do not sum to 100`);
    }

    const existing = await caseRepo.findOne({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`Case "${seed.slug}" already exists — skipping.`);
      continue;
    }

    const entity = caseRepo.create({
      slug: seed.slug,
      name: seed.name,
      priceCoins: seed.priceCoins,
      priceKeys: seed.priceKeys,
      imagePath: seed.imagePath,
      rarityWeights: seed.weights,
      isActive: true,
    });
    await caseRepo.save(entity);
    console.log(`Seeded case "${seed.slug}".`);
  }
}

async function seedPlaceholderCards(dataSource: DataSource, n: number): Promise<void> {
  const cardRepo = dataSource.getRepository(CardEntity);
  const counts = allocateRarityCounts(n);

  let inserted = 0;
  let skipped = 0;

  for (const rarity of RARITIES) {
    const count = counts[rarity];
    const [min, max] = RARITY_META[rarity].statRange;

    for (let i = 1; i <= count; i++) {
      const nn = String(i).padStart(2, '0');
      const slug = `placeholder-${rarity}-${nn}`;

      const existing = await cardRepo.findOne({ where: { slug } });
      if (existing) {
        skipped++;
        continue;
      }

      const card = cardRepo.create({
        slug,
        name: `Placeholder ${capitalize(rarity)} ${nn}`,
        flavorText: null,
        rarity,
        element: randomElementOf(ELEMENTS),
        archetype: randomElementOf(ARCHETYPES),
        attack: randomInt(min, max + 1),
        defense: randomInt(min, max + 1),
        imagePath: `cards/placeholder-${rarity}.png`,
        thumbPath: `thumbs/placeholder-${rarity}.png`,
        status: 'approved',
        setId: null,
        genMeta: { placeholder: true },
      });
      await cardRepo.save(card);
      inserted++;
    }
  }

  console.log(
    `Placeholder cards: inserted ${inserted}, skipped ${skipped} (already present). Requested ${n}.`,
  );
}

/** Case tile art. Distinct from rarity colours — purely cosmetic placeholders. */
const CASE_PLACEHOLDER_COLORS = ['#4B5563', '#7C3AED', '#DC2626'];

function writeCaseImages(casesDir: string): void {
  CASE_SEEDS.forEach((seed, index) => {
    const fileName = seed.imagePath.split('/').pop()!;
    const filePath = join(casesDir, fileName);
    if (existsSync(filePath)) return;
    const color = CASE_PLACEHOLDER_COLORS[index % CASE_PLACEHOLDER_COLORS.length]!;
    writeFileSync(filePath, createSolidColorPng(512, 512, color));
    console.log(`Wrote ${filePath}`);
  });
}

function writeRarityPlaceholderImages(cardsDir: string, thumbsDir: string): void {
  for (const rarity of RARITIES) {
    const color = RARITY_META[rarity].color;

    const cardFile = join(cardsDir, `placeholder-${rarity}.png`);
    if (!existsSync(cardFile)) {
      writeFileSync(cardFile, createSolidColorPng(512, 512, color));
      console.log(`Wrote ${cardFile}`);
    }

    const thumbFile = join(thumbsDir, `placeholder-${rarity}.png`);
    if (!existsSync(thumbFile)) {
      writeFileSync(thumbFile, createSolidColorPng(140, 140, color));
      console.log(`Wrote ${thumbFile}`);
    }
  }
}

/**
 * `--reset` TRUNCATEs six tables against whatever `DATABASE_URL` resolves to.
 * That is the single largest threat to the live card pool and play history, so
 * it is fused twice: an explicit opt-in env var, and a database-name check that
 * refuses anything other than the local dev database. The resolved DSN is
 * printed (password redacted) before either check so an operator pointing at
 * the wrong host sees it in the failure message.
 */
function assertResetAllowed(databaseUrl: string): void {
  const dsn = new URL(databaseUrl);
  const dbName = dsn.pathname.replace(/^\//, '');
  const redacted = `${dsn.protocol}//${dsn.username}@${dsn.host}/${dbName}`;
  console.log(`--reset target: ${redacted}`);

  if (process.env.ALLOW_DESTRUCTIVE_SEED !== '1') {
    throw new Error(
      '--reset refused: set ALLOW_DESTRUCTIVE_SEED=1 to truncate. ' +
        `Target was ${redacted}.`,
    );
  }
  if (dbName !== 'cardgame') {
    throw new Error(
      `--reset refused: database is "${dbName}", expected "cardgame". Target was ${redacted}.`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = configuration();

  const cardsDir = join(config.storageDir, 'cards');
  const thumbsDir = join(config.storageDir, 'thumbs');
  const casesDir = join(config.storageDir, 'cases');
  mkdirSync(cardsDir, { recursive: true });
  mkdirSync(thumbsDir, { recursive: true });
  mkdirSync(casesDir, { recursive: true });

  await AppDataSource.initialize();
  try {
    if (args.reset) {
      assertResetAllowed(config.databaseUrl);
      await AppDataSource.query(
        'TRUNCATE TABLE "transactions", "player_cards", "case_openings", "cases", "players", "cards" RESTART IDENTITY CASCADE',
      );
      console.log('--reset: truncated all six tables.');
    }

    await seedPlayer(AppDataSource);
    await seedCases(AppDataSource);

    writeCaseImages(casesDir);
    writeRarityPlaceholderImages(cardsDir, thumbsDir);

    if (args.placeholderCards > 0) {
      await seedPlaceholderCards(AppDataSource, args.placeholderCards);
    }

    console.log('Seed complete.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
