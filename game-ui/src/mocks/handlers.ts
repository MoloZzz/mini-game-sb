import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import {
  ARCHETYPES,
  CARD_STATUSES,
  CASE_SEEDS,
  DAILY_BONUS,
  DAILY_BONUS_COOLDOWN_MS,
  ELEMENTS,
  GENERATION_ORDER_STATUSES,
  PITY_RESET_RARITY,
  PITY_THRESHOLD,
  RARITIES,
  RARITY_META,
  RARITY_ORDER,
  MILESTONE_LADDER,
  THEMATIC_SET_SEEDS,
  WINNING_INDEX,
  isAtLeast,
  isRarity,
  type AdminCardDto,
  type ApiErrorCode,
  type ArchiveStatusDto,
  type Archetype,
  type CardDto,
  type CardStatus,
  type CaseDto,
  type CaseSeed,
  type ClaimDailyBonusResponse,
  type CollectionCardDto,
  type CollectionCardsResponse,
  type CollectionGoalDto,
  type CollectionProgressDto,
  type CreateArchiveDossierRequest,
  type CreateArchiveDossierResponse,
  type CreateGenerationOrderRequest,
  type DropHistoryItemDto,
  type Element,
  type EmptyPoolError,
  type GenerationOrderCandidateDto,
  type GenerationOrderDto,
  type GenerationOrderStatus,
  type GenerationOrdersListResponse,
  type InsufficientFundsError,
  type InventoryItemDto,
  type LastCopyError,
  type ListInventoryQuery,
  type OpenCaseRequest,
  type OpenCaseResponse,
  type Paginated,
  type PlayerDto,
  type PlayerRole,
  type Rarity,
  type RarityWeights,
  type ReviewCardRequest,
  type SelectGenerationOrderCandidateRequest,
  type SellCardResponse,
  type UpdateGenerationOrderRequest,
} from '@card-game/shared-types';

import { db, type MockAuthUser, type OwnedInstance } from './db';
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

function archiveNoteCards(): ArchiveStatusDto['noteCards'] {
  const ownedCardIds = new Set(db.ownedInstances.map((instance) => instance.cardId));
  const documentedCardIds = new Set(db.documentedCardIds);
  return MOCK_CARDS
    .filter((card) => ownedCardIds.has(card.id))
    .map((card) => ({ card, documented: documentedCardIds.has(card.id) }));
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
const CINDERBOUND_MOCK_COUNTS: Record<Rarity, number> = {
  common: 6, uncommon: 5, rare: 3, epic: 2, legendary: 1, mythic: 1,
};
const CINDERBOUND_MOCK_CARD_IDS = new Set(
  RARITIES.flatMap((rarity) => cardsByRarity[rarity]
    .slice(0, CINDERBOUND_MOCK_COUNTS[rarity])
    .map((card) => card.id)),
);

function cardsForCase(seed: CaseSeed, rarity: Rarity): CardDto[] {
  return seed.slug === 'cinderbound-cache'
    ? cardsByRarity[rarity].slice(0, CINDERBOUND_MOCK_COUNTS[rarity])
    : cardsByRarity[rarity];
}

function previewCardsFor(seed: CaseSeed): CardDto[] {
  const { weights } = seed;
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
    const pool = cardsForCase(seed, rarity);
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
    previewCards: previewCardsFor(seed),
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

    const pool = cardsForCase(caseSeed, rarity);
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

// --- GET /me/collection ------------------------------------------------------------

/**
 * Total pool size mirrors the fixture catalog (`MOCK_CARDS`, 6 cards per
 * rarity = 36) rather than any design-doc number — deliberately NOT 110 (the
 * old hardcoded pool constant), so a regression back to that constant would
 * fail this fixture's own assertions loudly instead of silently matching.
 */
function collectionTotalsByRarity(): Record<Rarity, number> {
  const totals = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const card of MOCK_CARDS) {
    totals[card.rarity] += 1;
  }
  return totals;
}

const getCollectionHandlers = mirror('/me/collection', (url) =>
  http.get(url, () => {
    const totals = collectionTotalsByRarity();
    const ownedByRarity = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const item of groupedInventory()) {
      ownedByRarity[item.card.rarity] += 1;
    }

    const byRarity = {} as CollectionProgressDto['byRarity'];
    let owned = 0;
    let total = 0;
    for (const rarity of RARITIES) {
      byRarity[rarity] = { owned: ownedByRarity[rarity], total: totals[rarity] };
      owned += ownedByRarity[rarity];
      total += totals[rarity];
    }

    const response: CollectionProgressDto = { owned, total, byRarity };
    return HttpResponse.json(response);
  }),
);

const getCollectionGoalHandlers = mirror('/me/collection/goal', (url) =>
  http.get(url, () => {
    const set = THEMATIC_SET_SEEDS[0]!;
    const current = new Set(
      db.ownedInstances.map((instance) => instance.cardId).filter((id) => CINDERBOUND_MOCK_CARD_IDS.has(id)),
    ).size;
    const setTarget = Object.values(CINDERBOUND_MOCK_COUNTS).reduce((sum, count) => sum + count, 0);
    if (current < setTarget) {
      const response: CollectionGoalDto = {
        id: set.slug,
        kind: 'set',
        title: set.name,
        description: `${set.description} Collect ${setTarget - current} more cards to complete the set.`,
        progress: { current, target: setTarget },
        reward: null,
        action: { label: 'Open Cinderbound Cache', href: `/open/${set.caseSlug}` },
      };
      return HttpResponse.json(response);
    }
    const tier = MILESTONE_LADDER.find((candidate) => current < candidate.uniqueCards);
    if (!tier) return HttpResponse.json(null);

    const remaining = tier.uniqueCards - current;
    const response: CollectionGoalDto = {
      id: tier.key,
      kind: 'milestone',
      title: `${tier.uniqueCards} unique cards`,
      description: `Collect ${remaining} more unique ${remaining === 1 ? 'card' : 'cards'} to claim this milestone.`,
      progress: { current, target: tier.uniqueCards },
      reward: tier.reward,
      action: { label: 'Choose a case', href: '/' },
    };
    return HttpResponse.json(response);
  }),
);

// --- GET /me/collection/cards -------------------------------------------------------

function parseArchetype(value: string | null): Archetype | undefined {
  if (value !== null && (ARCHETYPES as readonly string[]).includes(value)) return value as Archetype;
  return undefined;
}

/** Same ordering `CardsService.findMany` uses server-side: rarity desc, name asc. */
function sortedCatalog(): CardDto[] {
  return [...MOCK_CARDS].sort((a, b) => {
    const byRarity = RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
    return byRarity !== 0 ? byRarity : a.name.localeCompare(b.name);
  });
}

const getCollectionCardsHandlers = mirror('/me/collection/cards', (url) =>
  http.get(url, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const rarity = parseRarity(params.get('rarity'));
    const element = parseElement(params.get('element'));
    const archetype = parseArchetype(params.get('archetype'));
    const page = parsePositiveInt(params.get('page'), 1);
    const limit = parsePositiveInt(params.get('limit'), 40);

    let catalog = sortedCatalog();
    if (rarity) catalog = catalog.filter((c) => c.rarity === rarity);
    if (element) catalog = catalog.filter((c) => c.element === element);
    if (archetype) catalog = catalog.filter((c) => c.archetype === archetype);

    const ownedCardIds = new Set(db.ownedInstances.map((i) => i.cardId));
    const total = catalog.length;
    const pageItems = catalog.slice((page - 1) * limit, page * limit);

    const items: CollectionCardDto[] = pageItems.map((card) => {
      const owned = ownedCardIds.has(card.id);
      return { id: card.id, rarity: card.rarity, owned, card: owned ? card : null };
    });

    const response: CollectionCardsResponse = { items, total, page, limit };
    return HttpResponse.json(response);
  }),
);

// --- Archive Notes ---------------------------------------------------------------

const getArchiveHandlers = mirror('/me/archive', (url) =>
  http.get(url, () => HttpResponse.json({ noteCards: archiveNoteCards(), passes: db.archivePasses })),
);

const createArchiveDossierHandlers = mirror('/me/archive/dossiers', (url) =>
  http.post(url, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as CreateArchiveDossierRequest | null;
    const cardIds = body?.cardIds;
    const selected = Array.isArray(cardIds) ? cardIds : [];
    const eligibleIds = new Set(archiveNoteCards().filter((note) => !note.documented).map((note) => note.card.id));

    if (selected.length !== 3 || new Set(selected).size !== 3 || selected.some((id) => !eligibleIds.has(id))) {
      return HttpResponse.json(apiError('ARCHIVE_INVALID_DOSSIER', 'Choose three different undocumented cards.'), {
        status: 400,
      });
    }

    const pass = { id: crypto.randomUUID(), earnedAt: new Date().toISOString() };
    db.documentedCardIds.push(...selected);
    db.archivePasses.push(pass);
    const response: CreateArchiveDossierResponse = { pass, documentedCardIds: selected };
    return HttpResponse.json(response, { status: 201 });
  }),
);

const openArchivePassHandlers = mirror('/me/archive/passes/:passId/open', (url) =>
  http.post(url, ({ params }) => {
    const passId = requirePathParam(params.passId, 'passId');
    const passIndex = db.archivePasses.findIndex((pass) => pass.id === passId);
    if (passIndex === -1) {
      return HttpResponse.json(apiError('ARCHIVE_PASS_NOT_FOUND', 'This Archive Pass is no longer available.'), { status: 404 });
    }

    db.archivePasses.splice(passIndex, 1);
    const starterChest = CASE_SEEDS.find((caseSeed) => caseSeed.slug === 'starter-chest')!;
    const rarity = rollRarity(starterChest.weights);
    const wonCard = cardsForCase(starterChest, rarity)[Math.floor(Math.random() * cardsForCase(starterChest, rarity).length)]!;
    const instance: OwnedInstance = {
      instanceId: crypto.randomUUID(),
      cardId: wonCard.id,
      acquiredAt: new Date().toISOString(),
    };
    db.ownedInstances.push(instance);
    const copies = db.ownedInstances.filter((candidate) => candidate.cardId === wonCard.id).length;
    const drop: DropHistoryItemDto = {
      dropId: crypto.randomUUID(),
      caseSlug: 'archive-cache',
      caseName: 'Archive Cache',
      card: wonCard,
      createdAt: instance.acquiredAt,
    };
    db.drops.push(drop);
    db.casesOpened += 1;

    const response: OpenCaseResponse = {
      dropId: drop.dropId,
      reel: buildReel(wonCard),
      winningIndex: WINNING_INDEX,
      wonCard,
      isDuplicate: copies > 1,
      copies,
      balance: db.balance,
    };
    return HttpResponse.json(response);
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

// --- /admin/generation-orders -------------------------------------------------
//
// These mirror the service's state guards rather than accepting every call,
// because a mock that always succeeds is the reason a screen can pass in mock
// mode and 409 against the real API.

function parseOrderStatus(value: string | null): GenerationOrderStatus | undefined {
  return value !== null && (GENERATION_ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as GenerationOrderStatus)
    : undefined;
}

function findOrder(id: string): GenerationOrderDto | undefined {
  return db.generationOrders.find((order) => order.id === id);
}

function orderNotFound(id: string) {
  return HttpResponse.json(apiError('GENERATION_ORDER_NOT_FOUND', `Generation order ${id} not found`), {
    status: 404,
  });
}

function wrongOrderState(order: GenerationOrderDto, accepted: readonly GenerationOrderStatus[]) {
  return HttpResponse.json(
    apiError('INVALID_GENERATION_ORDER_STATE', `Order is ${order.status}; expected ${accepted.join(' or ')}`),
    { status: 409 },
  );
}

function mockCandidates(order: GenerationOrderDto, count: number): GenerationOrderCandidateDto[] {
  const crop = Math.random().toString(16).slice(2, 8);
  return Array.from({ length: count }, (_, index) => ({
    id: `${order.id}-${crop}-candidate-${index + 1}`,
    index: index + 1,
    slug: `${slugifyTitle(order.title)}-${crop}-${index + 1}`,
    seed: String(1 + Math.floor(Math.random() * 2_147_483_646)),
    status: 'planned',
    cardId: null,
    thumbUrl: null,
    cardName: null,
  }));
}

function slugifyTitle(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug.length > 0 ? slug.slice(0, 48) : 'order';
}

/** Mirrors `rejectDraftCards`: only a card still in `draft` may be flipped. */
function rejectOrderDraftCards(order: GenerationOrderDto, keepCardId?: string | null): void {
  for (const candidate of order.candidates) {
    if (!candidate.cardId || candidate.cardId === keepCardId) continue;
    const card = db.adminCards.find((c) => c.id === candidate.cardId);
    if (card?.status === 'draft') card.status = 'rejected';
  }
}

const getGenerationOrdersHandlers = mirror('/admin/generation-orders', (url) =>
  http.get(url, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const status = parseOrderStatus(params.get('status'));
    const page = parsePositiveInt(params.get('page'), 1);
    const limit = parsePositiveInt(params.get('limit'), 40);

    let items = db.generationOrders;
    if (status) items = items.filter((order) => order.status === status);

    const response: GenerationOrdersListResponse = {
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
    };
    return HttpResponse.json(response);
  }),
);

const createGenerationOrderHandlers = mirror('/admin/generation-orders', (url) =>
  http.post(url, async ({ request }) => {
    const body = (await request.json()) as CreateGenerationOrderRequest;
    const id = crypto.randomUUID();
    const order: GenerationOrderDto = {
      id,
      status: 'draft',
      title: body.title.trim(),
      brief: body.brief.trim(),
      archetype: body.archetype,
      element: body.element,
      suggestedRarity: body.suggestedRarity,
      candidateCount: body.candidateCount ?? 4,
      setId: body.setId ?? null,
      recipeProfile: 'card-v1',
      createdByPlayerId: 'mock-admin-1',
      createdAt: new Date().toISOString(),
      readyAt: null,
      generatedAt: null,
      completedAt: null,
      failureCode: null,
      failureDetail: null,
      candidates: [],
    };
    order.candidates = mockCandidates(order, order.candidateCount);
    db.generationOrders.unshift(order);
    return HttpResponse.json(order, { status: 201 });
  }),
);

const updateGenerationOrderHandlers = mirror('/admin/generation-orders/:id', (url) =>
  http.patch(url, async ({ params, request }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (order.status !== 'draft') return wrongOrderState(order, ['draft']);

    const body = (await request.json()) as UpdateGenerationOrderRequest;
    if (body.title !== undefined) order.title = body.title.trim();
    if (body.brief !== undefined) order.brief = body.brief.trim();
    if (body.archetype !== undefined) order.archetype = body.archetype;
    if (body.element !== undefined) order.element = body.element;
    if (body.suggestedRarity !== undefined) order.suggestedRarity = body.suggestedRarity;
    if (body.setId !== undefined) order.setId = body.setId;
    const countChanged = body.candidateCount !== undefined && body.candidateCount !== order.candidateCount;
    if (body.candidateCount !== undefined) order.candidateCount = body.candidateCount;
    if (body.title !== undefined || countChanged) {
      order.candidates = mockCandidates(order, order.candidateCount);
    }
    return HttpResponse.json(order);
  }),
);

const queueGenerationOrderHandlers = mirror('/admin/generation-orders/:id/queue', (url) =>
  http.post(url, ({ params }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (order.status !== 'draft') return wrongOrderState(order, ['draft']);
    order.status = 'ready';
    order.readyAt = new Date().toISOString();
    order.failureCode = null;
    order.failureDetail = null;
    return HttpResponse.json(order);
  }),
);

const retryGenerationOrderHandlers = mirror('/admin/generation-orders/:id/retry', (url) =>
  http.post(url, ({ params }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (order.status !== 'failed') return wrongOrderState(order, ['failed']);
    order.status = 'ready';
    order.readyAt = new Date().toISOString();
    order.failureCode = null;
    order.failureDetail = null;
    return HttpResponse.json(order);
  }),
);

const cancelGenerationOrderHandlers = mirror('/admin/generation-orders/:id/cancel', (url) =>
  http.post(url, ({ params }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (!['draft', 'ready', 'review'].includes(order.status)) {
      return wrongOrderState(order, ['draft', 'ready', 'review']);
    }
    if (order.status === 'review') {
      rejectOrderDraftCards(order);
      order.candidates = order.candidates.map((candidate) => ({ ...candidate, status: 'discarded' }));
    }
    order.status = 'cancelled';
    return HttpResponse.json(order);
  }),
);

const regenerateGenerationOrderHandlers = mirror('/admin/generation-orders/:id/regenerate', (url) =>
  http.post(url, ({ params }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (order.status !== 'review' && order.status !== 'failed') {
      return wrongOrderState(order, ['review', 'failed']);
    }
    rejectOrderDraftCards(order);
    order.candidates = mockCandidates(order, order.candidateCount);
    order.status = 'ready';
    order.readyAt = new Date().toISOString();
    order.generatedAt = null;
    order.failureCode = null;
    order.failureDetail = null;
    return HttpResponse.json(order);
  }),
);

const selectGenerationOrderCandidateHandlers = mirror('/admin/generation-orders/:id/select', (url) =>
  http.post(url, async ({ params, request }) => {
    const id = requirePathParam(params.id, 'id');
    const order = findOrder(id);
    if (!order) return orderNotFound(id);
    if (order.status !== 'review') return wrongOrderState(order, ['review']);

    const body = (await request.json()) as SelectGenerationOrderCandidateRequest;
    const selected = order.candidates.find((candidate) => candidate.id === body.candidateId);
    if (!selected?.cardId) {
      return HttpResponse.json(
        apiError('GENERATION_CANDIDATE_MISMATCH', 'Selected candidate is not generated for this order'),
        { status: 400 },
      );
    }

    const card = db.adminCards.find((c) => c.id === selected.cardId);
    if (card) {
      card.name = body.name.trim();
      if (body.rarity !== undefined) card.rarity = body.rarity;
      if (body.attack !== undefined) card.attack = body.attack;
      if (body.defense !== undefined) card.defense = body.defense;
      card.flavorText = body.flavorText ?? null;
      card.status = 'approved';
    }
    rejectOrderDraftCards(order, selected.cardId);
    order.candidates = order.candidates.map((candidate) => ({
      ...candidate,
      status: candidate.id === selected.id ? 'selected' : 'discarded',
      cardName: candidate.id === selected.id ? body.name.trim() : candidate.cardName,
    }));
    order.status = 'completed';
    order.completedAt = new Date().toISOString();
    return HttpResponse.json(order);
  }),
);

// --- Auth: POST /auth/register, POST /auth/login, GET /auth/me -----------------
//
// A self-contained mock JWT: unsigned (no real crypto, no shared secret with
// the real server — the two token schemes are not interchangeable), but
// shaped exactly like the real one (base64url header.payload.signature) so
// `decodeClaims` in `src/lib/auth.ts` — the one function that ever reads a
// token client-side — decodes it identically in mock and live mode.

interface MockAuthResponse {
  token: string;
  player: PlayerDto;
}

function base64UrlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function issueMockToken(user: MockAuthUser): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
  const payload = base64UrlEncode(
    JSON.stringify({ sub: user.id, role: user.role, iat: nowSeconds, exp: nowSeconds + SEVEN_DAYS_S }),
  );
  // No real signature to compute — this segment only needs to exist so the
  // token has the expected three-part shape.
  return `${header}.${payload}.mock-signature`;
}

function decodeMockToken(token: string): { sub: string; role: PlayerRole } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const parsed: unknown = JSON.parse(atob(padded));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.sub !== 'string') return null;
    if (record.role !== 'player' && record.role !== 'admin') return null;
    return { sub: record.sub, role: record.role };
  } catch {
    return null;
  }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Every mock account shares the single `db.balance`/stats state, same as every other handler here — there's only ever one "current player" in mock mode. */
function mockPlayerDto(user: MockAuthUser): PlayerDto {
  const uniqueCards = new Set(db.ownedInstances.map((i) => i.cardId)).size;
  return {
    id: user.id,
    displayName: user.displayName,
    balance: db.balance,
    stats: {
      casesOpened: db.casesOpened,
      uniqueCards,
      totalCards: db.ownedInstances.length,
    },
    dailyBonusAvailableAt: db.dailyBonusAvailableAt,
    pityCounter: db.pityCounter,
  };
}

interface RegisterBody {
  displayName?: string;
  email?: string;
  password?: string;
}

const registerHandlers = mirror('/auth/register', (url) =>
  http.post(url, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as RegisterBody;
    const email = (body.email ?? '').toLowerCase();

    if (db.authUsers.some((u) => u.email === email)) {
      return HttpResponse.json(apiError('EMAIL_TAKEN', `Email ${email} is already registered`), {
        status: 409,
      });
    }

    const user: MockAuthUser = {
      id: crypto.randomUUID(),
      displayName: body.displayName ?? 'Player',
      email,
      password: body.password ?? '',
      role: 'player',
    };
    db.authUsers.push(user);

    const response: MockAuthResponse = { token: issueMockToken(user), player: mockPlayerDto(user) };
    return HttpResponse.json(response);
  }),
);

interface LoginBody {
  email?: string;
  password?: string;
}

const loginHandlers = mirror('/auth/login', (url) =>
  http.post(url, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as LoginBody;
    const email = (body.email ?? '').toLowerCase();
    const user = db.authUsers.find((u) => u.email === email);

    if (!user || user.password !== body.password) {
      return HttpResponse.json(apiError('INVALID_CREDENTIALS', 'Invalid email or password'), {
        status: 401,
      });
    }

    const response: MockAuthResponse = { token: issueMockToken(user), player: mockPlayerDto(user) };
    return HttpResponse.json(response);
  }),
);

const authMeHandlers = mirror('/auth/me', (url) =>
  http.get(url, ({ request }) => {
    const token = bearerToken(request);
    const claims = token ? decodeMockToken(token) : null;
    const user = claims ? db.authUsers.find((u) => u.id === claims.sub) : undefined;

    if (!user) {
      return HttpResponse.json(apiError('UNAUTHORIZED', 'Missing or invalid token'), { status: 401 });
    }

    return HttpResponse.json(mockPlayerDto(user));
  }),
);

export const handlers: HttpHandler[] = [
  ...getCasesHandlers,
  ...openCaseHandlers,
  ...getMeHandlers,
  ...getInventoryHandlers,
  ...getCollectionHandlers,
  ...getCollectionGoalHandlers,
  ...getCollectionCardsHandlers,
  ...getArchiveHandlers,
  ...createArchiveDossierHandlers,
  ...openArchivePassHandlers,
  ...sellInstanceHandlers,
  ...getDropsHandlers,
  ...claimDailyBonusHandlers,
  ...getAdminCardsHandlers,
  ...reviewCardHandlers,
  ...getGenerationOrdersHandlers,
  ...createGenerationOrderHandlers,
  ...updateGenerationOrderHandlers,
  ...queueGenerationOrderHandlers,
  ...retryGenerationOrderHandlers,
  ...cancelGenerationOrderHandlers,
  ...regenerateGenerationOrderHandlers,
  ...selectGenerationOrderCandidateHandlers,
  ...registerHandlers,
  ...loginHandlers,
  ...authMeHandlers,
];
