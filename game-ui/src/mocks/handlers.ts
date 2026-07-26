import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import {
  CARD_STATUSES,
  CASE_SEEDS,
  DAILY_BONUS,
  DAILY_BONUS_COOLDOWN_MS,
  ELEMENTS,
  PITY_RESET_RARITY,
  PITY_THRESHOLD,
  RARITIES,
  RARITY_META,
  RARITY_ORDER,
  WINNING_INDEX,
  isAtLeast,
  isRarity,
  type AdminCardDto,
  type ApiErrorCode,
  type CardDto,
  type CardStatus,
  type CaseDto,
  type CaseSeed,
  type ClaimDailyBonusResponse,
  type DropHistoryItemDto,
  type Element,
  type EmptyPoolError,
  type InsufficientFundsError,
  type InventoryItemDto,
  type LastCopyError,
  type ListInventoryQuery,
  type OpenCaseRequest,
  type OpenCaseResponse,
  type Paginated,
  type PlayerDto,
  type Rarity,
  type RarityWeights,
  type ReviewCardRequest,
  type SellCardResponse,
} from '@card-game/shared-types';

import { db, type OwnedInstance } from './db';
import { MOCK_CARDS, cardsByRarity } from './fixtures/cards';
import { buildReel, rollRarity } from './fixtures/reel';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const RELATIVE_BASE = '*/api';

/**
 * Registers the same resolver at two URLs: the configured absolute base
 * (matches real dev/browser usage against `http://localhost:3000/api`) and
 * a bare wildcard "star-slash-api" path (matches under jsdom in tests, whose
 * origin for a relative fetch may not equal the configured base at all).
 */
function mirror(path: string, build: (url: string) => HttpHandler): HttpHandler[] {
  return [build(`${API_BASE}${path}`), build(`${RELATIVE_BASE}${path}`)];
}

function requirePathParam(value: string | readonly string[] | undefined, name: string): string {
  if (typeof value !== 'string') throw new Error(`Expected path parameter "${name}"`);
  return value;
}

function findCardById(id: string): CardDto | undefined {
  return MOCK_CARDS.find((card) => card.id === id);
}

function apiError(code: ApiErrorCode, message: string): { code: ApiErrorCode; message: string } {
  return { code, message };
}

// --- GET /cases ---------------------------------------------------------------

/**
 * Rarest-first, but round-robin across every eligible rarity rather than
 * draining the rarest pool alone. Every mythic pool happens to hold exactly 6
 * cards (NAMES_BY_RARITY), so filling straight from the top would give all
 * nine cases — from starter-chest to void-casket — the identical 6-mythic
 * preview strip regardless of how different their actual odds curves are.
 * Cycling instead means a case's preview at least hints at its real shape
 * (e.g. a mostly-common case still shows some commons, not just its rarest
 * possible pull).
 */
function previewCardsFor(weights: RarityWeights): CardDto[] {
  const rarestFirst = [...RARITIES].reverse();
  const eligibleRarities = rarestFirst.filter((rarity) => weights[rarity] > 0);
  if (eligibleRarities.length === 0) return [];

  const cards: CardDto[] = [];
  const takenPerRarity = new Map<Rarity, number>();
  let round = 0;
  // Bounded by eligibleRarities.length full passes over each pool (6 cards
  // each) — guarantees termination even if every eligible pool is smaller
  // than 6 and together they can't fill all 6 slots.
  const maxRounds = eligibleRarities.length * 6;

  while (cards.length < 6 && round < maxRounds) {
    const rarity = eligibleRarities[round % eligibleRarities.length];
    const pool = cardsByRarity[rarity];
    const taken = takenPerRarity.get(rarity) ?? 0;
    if (taken < pool.length) {
      cards.push(pool[taken]);
      takenPerRarity.set(rarity, taken + 1);
    }
    round++;
  }
  return cards;
}

function buildCaseDto(seed: CaseSeed): CaseDto {
  return {
    slug: seed.slug,
    name: seed.name,
    priceCoins: seed.priceCoins,
    priceKeys: seed.priceKeys,
    imageUrl: `/mock/cases/${seed.slug}.svg`,
    odds: seed.weights,
    previewCards: previewCardsFor(seed.weights),
  };
}

const getCasesHandlers = mirror('/cases', (url) =>
  http.get(url, () => HttpResponse.json(CASE_SEEDS.map(buildCaseDto))),
);

// --- POST /cases/:slug/open ----------------------------------------------------

/**
 * Pity strips the low tiers and renormalises what remains to 100 — the roll
 * algorithm from 05 - Game Design - Rarity & Drop Rates.md.
 */
function applyPity(weights: RarityWeights): RarityWeights {
  const highSum = weights.epic + weights.legendary + weights.mythic;
  if (highSum <= 0) return weights;
  const scale = 100 / highSum;
  return {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: weights.epic * scale,
    legendary: weights.legendary * scale,
    mythic: weights.mythic * scale,
  };
}

/**
 * Dev-only escape hatch. The fixture pool deliberately keeps every rarity
 * non-empty (every rarity must be drawable), so EMPTY_POOL can never occur
 * naturally — this clientSeed value lets the UI exercise that 409 branch
 * on demand instead.
 */
const FORCE_EMPTY_POOL_SEED = 'force-empty-pool';

async function parseOpenCaseBody(request: Request): Promise<OpenCaseRequest | undefined> {
  const text = await request.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as OpenCaseRequest;
  } catch {
    return undefined;
  }
}

const openCaseHandlers = mirror('/cases/:slug/open', (url) =>
  http.post(url, async ({ params, request }) => {
    await delay(60);

    const slug = requirePathParam(params.slug, 'slug');
    const caseSeed = CASE_SEEDS.find((c) => c.slug === slug);
    if (!caseSeed) {
      return HttpResponse.json(apiError('CASE_NOT_FOUND', `No such case: ${slug}`), { status: 404 });
    }

    const body = await parseOpenCaseBody(request);

    if (caseSeed.priceCoins !== null && db.balance.coins < caseSeed.priceCoins) {
      const err: InsufficientFundsError = {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Not enough coins to open this case.',
        need: { coins: caseSeed.priceCoins },
        have: db.balance,
      };
      return HttpResponse.json(err, { status: 402 });
    }
    if (caseSeed.priceKeys !== null && db.balance.keys < caseSeed.priceKeys) {
      const err: InsufficientFundsError = {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Not enough keys to open this case.',
        need: { keys: caseSeed.priceKeys },
        have: db.balance,
      };
      return HttpResponse.json(err, { status: 402 });
    }

    if (caseSeed.priceCoins !== null) db.balance.coins -= caseSeed.priceCoins;
    if (caseSeed.priceKeys !== null) db.balance.keys -= caseSeed.priceKeys;

    const effectiveWeights =
      db.pityCounter >= PITY_THRESHOLD ? applyPity(caseSeed.weights) : caseSeed.weights;
    const rarity = rollRarity(effectiveWeights);

    const pool = cardsByRarity[rarity];
    if (pool.length === 0 || body?.clientSeed === FORCE_EMPTY_POOL_SEED) {
      const err: EmptyPoolError = {
        code: 'EMPTY_POOL',
        message: `No approved cards of rarity ${rarity} exist yet.`,
        rarity,
      };
      return HttpResponse.json(err, { status: 409 });
    }

    const wonCard = pool[Math.floor(Math.random() * pool.length)];
    const reel = buildReel(wonCard);

    const instance: OwnedInstance = {
      instanceId: crypto.randomUUID(),
      cardId: wonCard.id,
      acquiredAt: new Date().toISOString(),
    };
    db.ownedInstances.push(instance);

    const copies = db.ownedInstances.filter((i) => i.cardId === wonCard.id).length;
    const isDuplicate = copies > 1;

    const drop: DropHistoryItemDto = {
      dropId: crypto.randomUUID(),
      caseSlug: caseSeed.slug,
      caseName: caseSeed.name,
      card: wonCard,
      createdAt: instance.acquiredAt,
    };
    db.drops.push(drop);
    db.casesOpened += 1;
    db.pityCounter = isAtLeast(rarity, PITY_RESET_RARITY) ? 0 : db.pityCounter + 1;

    const response: OpenCaseResponse = {
      dropId: drop.dropId,
      reel,
      winningIndex: WINNING_INDEX,
      wonCard,
      isDuplicate,
      copies,
      balance: db.balance,
    };
    return HttpResponse.json(response);
  }),
);

// --- GET /me --------------------------------------------------------------------

const getMeHandlers = mirror('/me', (url) =>
  http.get(url, () => {
    const uniqueCards = new Set(db.ownedInstances.map((i) => i.cardId)).size;
    const player: PlayerDto = {
      id: 'mock-player',
      displayName: 'Molo',
      balance: db.balance,
      stats: {
        casesOpened: db.casesOpened,
        uniqueCards,
        totalCards: db.ownedInstances.length,
      },
      dailyBonusAvailableAt: db.dailyBonusAvailableAt,
      pityCounter: db.pityCounter,
    };
    return HttpResponse.json(player);
  }),
);

// --- GET /me/inventory ------------------------------------------------------------

function groupedInventory(): InventoryItemDto[] {
  const byCard = new Map<string, OwnedInstance[]>();
  for (const instance of db.ownedInstances) {
    const list = byCard.get(instance.cardId);
    if (list) list.push(instance);
    else byCard.set(instance.cardId, [instance]);
  }

  const items: InventoryItemDto[] = [];
  for (const [cardId, instances] of byCard) {
    const card = findCardById(cardId);
    if (!card) continue;
    const oldest = [...instances].sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt))[0];
    items.push({
      instanceId: oldest.instanceId,
      card,
      acquiredAt: oldest.acquiredAt,
      copies: instances.length,
    });
  }
  return items;
}

function sortInventory(
  items: InventoryItemDto[],
  sort: ListInventoryQuery['sort'] | undefined,
): InventoryItemDto[] {
  const sorted = [...items];
  switch (sort) {
    case 'rarity_asc':
      return sorted.sort((a, b) => RARITY_ORDER[a.card.rarity] - RARITY_ORDER[b.card.rarity]);
    case 'name_asc':
      return sorted.sort((a, b) => a.card.name.localeCompare(b.card.name));
    case 'acquired_desc':
      return sorted.sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
    case 'rarity_desc':
    default:
      return sorted.sort((a, b) => RARITY_ORDER[b.card.rarity] - RARITY_ORDER[a.card.rarity]);
  }
}

const INVENTORY_SORTS = ['rarity_desc', 'rarity_asc', 'acquired_desc', 'name_asc'] as const;

function parseInventorySort(value: string | null): ListInventoryQuery['sort'] | undefined {
  if (value !== null && (INVENTORY_SORTS as readonly string[]).includes(value)) {
    return value as ListInventoryQuery['sort'];
  }
  return undefined;
}

function parseElement(value: string | null): Element | undefined {
  if (value !== null && (ELEMENTS as readonly string[]).includes(value)) return value as Element;
  return undefined;
}

function parseCardStatus(value: string | null): CardStatus | undefined {
  if (value !== null && (CARD_STATUSES as readonly string[]).includes(value)) {
    return value as CardStatus;
  }
  return undefined;
}

function parseRarity(value: string | null): Rarity | undefined {
  return value !== null && isRarity(value) ? value : undefined;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = value !== null ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const getInventoryHandlers = mirror('/me/inventory', (url) =>
  http.get(url, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const rarity = parseRarity(params.get('rarity'));
    const element = parseElement(params.get('element'));
    const sort = parseInventorySort(params.get('sort'));
    const page = parsePositiveInt(params.get('page'), 1);
    const limit = parsePositiveInt(params.get('limit'), 20);

    let items = groupedInventory();
    if (rarity) items = items.filter((i) => i.card.rarity === rarity);
    if (element) items = items.filter((i) => i.card.element === element);
    items = sortInventory(items, sort);

    const total = items.length;
    const pageItems = items.slice((page - 1) * limit, page * limit);

    return HttpResponse.json({ items: pageItems, total, page, limit });
  }),
);

// --- POST /me/inventory/:instanceId/sell -------------------------------------------

const sellInstanceHandlers = mirror('/me/inventory/:instanceId/sell', (url) =>
  http.post(url, ({ params }) => {
    const instanceId = requirePathParam(params.instanceId, 'instanceId');
    const instance = db.ownedInstances.find((i) => i.instanceId === instanceId);
    if (!instance) {
      return HttpResponse.json(apiError('INSTANCE_NOT_FOUND', `No such instance: ${instanceId}`), {
        status: 404,
      });
    }

    const card = findCardById(instance.cardId);
    if (!card) {
      return HttpResponse.json(apiError('INSTANCE_NOT_FOUND', `No such instance: ${instanceId}`), {
        status: 404,
      });
    }

    const copies = db.ownedInstances.filter((i) => i.cardId === instance.cardId).length;
    if (copies <= 1) {
      const err: LastCopyError = {
        code: 'LAST_COPY',
        message: "Can't sell your last copy of this card.",
        cardId: card.id,
      };
      return HttpResponse.json(err, { status: 409 });
    }

    db.ownedInstances = db.ownedInstances.filter((i) => i.instanceId !== instanceId);
    const gainedCoins = RARITY_META[card.rarity].sellValue;
    db.balance.coins += gainedCoins;

    const response: SellCardResponse = { gained: { coins: gainedCoins }, balance: db.balance };
    return HttpResponse.json(response);
  }),
);

// --- GET /me/drops ---------------------------------------------------------------

const getDropsHandlers = mirror('/me/drops', (url) =>
  http.get(url, ({ request }) => {
    const limit = parsePositiveInt(new URL(request.url).searchParams.get('limit'), 20);
    const sorted = [...db.drops].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(sorted.slice(0, limit));
  }),
);

// --- POST /me/daily-bonus ----------------------------------------------------------

const claimDailyBonusHandlers = mirror('/me/daily-bonus', (url) =>
  http.post(url, () => {
    const now = Date.now();
    if (db.dailyBonusAvailableAt !== null && new Date(db.dailyBonusAvailableAt).getTime() > now) {
      return HttpResponse.json(apiError('DAILY_BONUS_NOT_READY', 'Daily bonus is still on cooldown.'), {
        status: 409,
      });
    }

    db.balance.coins += DAILY_BONUS.coins;
    db.balance.keys += DAILY_BONUS.keys;
    const nextAvailableAt = new Date(now + DAILY_BONUS_COOLDOWN_MS).toISOString();
    db.dailyBonusAvailableAt = nextAvailableAt;

    const response: ClaimDailyBonusResponse = {
      gained: { ...DAILY_BONUS },
      balance: db.balance,
      nextAvailableAt,
    };
    return HttpResponse.json(response);
  }),
);

// --- GET /admin/cards --------------------------------------------------------------

const getAdminCardsHandlers = mirror('/admin/cards', (url) =>
  http.get(url, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = parseCardStatus(params.get('status'));
    const page = parsePositiveInt(params.get('page'), 1);
    const limit = parsePositiveInt(params.get('limit'), 20);

    let items = db.adminCards;
    if (status) items = items.filter((c) => c.status === status);

    const total = items.length;
    const pageItems = items.slice((page - 1) * limit, page * limit);

    const response: Paginated<AdminCardDto> = { items: pageItems, total, page, limit };
    return HttpResponse.json(response);
  }),
);

// --- PATCH /admin/cards/:id ---------------------------------------------------------

const reviewCardHandlers = mirror('/admin/cards/:id', (url) =>
  http.patch(url, async ({ params, request }) => {
    const id = requirePathParam(params.id, 'id');
    const card = db.adminCards.find((c) => c.id === id);
    if (!card) {
      return HttpResponse.json(apiError('CARD_NOT_FOUND', `No such card: ${id}`), { status: 404 });
    }

    const body = (await request.json()) as ReviewCardRequest;
    if (body.status !== undefined) card.status = body.status;
    if (body.name !== undefined) card.name = body.name;
    if (body.rarity !== undefined) card.rarity = body.rarity;
    if (body.element !== undefined) card.element = body.element;
    if (body.archetype !== undefined) card.archetype = body.archetype;
    if (body.attack !== undefined) card.attack = body.attack;
    if (body.defense !== undefined) card.defense = body.defense;
    if (body.flavorText !== undefined) card.flavorText = body.flavorText;

    return HttpResponse.json(card);
  }),
);

export const handlers: HttpHandler[] = [
  ...getCasesHandlers,
  ...openCaseHandlers,
  ...getMeHandlers,
  ...getInventoryHandlers,
  ...sellInstanceHandlers,
  ...getDropsHandlers,
  ...claimDailyBonusHandlers,
  ...getAdminCardsHandlers,
  ...reviewCardHandlers,
];
