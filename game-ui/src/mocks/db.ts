import {
  ARCHETYPES,
  CASE_SEEDS,
  ELEMENTS,
  INITIAL_GRANT,
  RARITIES,
  RARITY_META,
  type AdminCardDto,
  type Archetype,
  type Balance,
  type DropHistoryItemDto,
  type Element,
  type GenMeta,
  type PlayerRole,
  type Rarity,
} from '@card-game/shared-types';

import { MOCK_CARDS } from './fixtures/cards';

export interface OwnedInstance {
  instanceId: string;
  cardId: string;
  acquiredAt: string;
}

/**
 * A mock account created via `POST /auth/register` (or seeded below).
 * `password` is stored in plaintext deliberately — this is an in-memory MSW
 * fixture, not the real auth store, and never leaves the test/dev process.
 */
export interface MockAuthUser {
  id: string;
  displayName: string;
  email: string;
  password: string;
  role: PlayerRole;
}

export interface MockDb {
  balance: Balance;
  ownedInstances: OwnedInstance[];
  drops: DropHistoryItemDto[];
  pityCounter: number;
  casesOpened: number;
  dailyBonusAvailableAt: string | null;
  adminCards: AdminCardDto[];
  authUsers: MockAuthUser[];
  documentedCardIds: string[];
  archivePasses: Array<{ id: string; earnedAt: string }>;
}

const NOW = Date.now();
const HOUR_MS = 60 * 60 * 1000;

function isoHoursAgo(hours: number): string {
  return new Date(NOW - hours * HOUR_MS).toISOString();
}

function cardById(id: string) {
  const card = MOCK_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Unknown mock card id: ${id}`);
  return card;
}

/**
 * ~10 seed instances across a handful of cards, oldest first, so the
 * inventory screen isn't empty on first load and both "×1" and "×N" copy
 * badges are exercised from the start.
 */
function seedOwnedInstances(): OwnedInstance[] {
  const plan: Array<{ cardId: string; count: number; startHoursAgo: number }> = [
    { cardId: 'mock-common-1', count: 3, startHoursAgo: 96 },
    { cardId: 'mock-common-2', count: 2, startHoursAgo: 72 },
    { cardId: 'mock-uncommon-1', count: 2, startHoursAgo: 48 },
    { cardId: 'mock-rare-1', count: 1, startHoursAgo: 24 },
    { cardId: 'mock-epic-1', count: 1, startHoursAgo: 12 },
    { cardId: 'mock-legendary-1', count: 1, startHoursAgo: 3 },
  ];

  const instances: OwnedInstance[] = [];
  let sequence = 0;
  for (const { cardId, count, startHoursAgo } of plan) {
    for (let i = 0; i < count; i++) {
      instances.push({
        instanceId: `seed-instance-${sequence + 1}`,
        cardId,
        acquiredAt: isoHoursAgo(startHoursAgo - i * 2),
      });
      sequence++;
    }
  }
  return instances;
}

function seedDrops(): DropHistoryItemDto[] {
  const plan: Array<{ cardId: string; caseSlug: string; hoursAgo: number }> = [
    { cardId: 'mock-legendary-1', caseSlug: 'starter-chest', hoursAgo: 3 },
    { cardId: 'mock-epic-1', caseSlug: 'ember-vault', hoursAgo: 12 },
    { cardId: 'mock-rare-1', caseSlug: 'starter-chest', hoursAgo: 24 },
    { cardId: 'mock-uncommon-1', caseSlug: 'starter-chest', hoursAgo: 48 },
    { cardId: 'mock-common-2', caseSlug: 'starter-chest', hoursAgo: 72 },
  ];

  return plan.map(({ cardId, caseSlug, hoursAgo }, index) => {
    const caseSeed = CASE_SEEDS.find((c) => c.slug === caseSlug);
    if (!caseSeed) throw new Error(`Unknown case slug in drop seed: ${caseSlug}`);
    return {
      dropId: `seed-drop-${index + 1}`,
      caseSlug,
      caseName: caseSeed.name,
      card: cardById(cardId),
      createdAt: isoHoursAgo(hoursAgo),
    };
  });
}

const DRAFT_ADJECTIVES = ['Feral', 'Ashen', 'Gilded', 'Hollow', 'Verdant', 'Obsidian'] as const;
const DRAFT_NOUNS = ['Serpent', 'Golem', 'Harpy', 'Wyrm'] as const;

const NEGATIVE_PROMPT =
  'blurry, lowres, bad anatomy, extra limbs, watermark, text, jpeg artifacts, deformed';

function draftStat(rarity: Rarity, index: number, offset: number): number {
  const [min, max] = RARITY_META[rarity].statRange;
  const span = max - min + 1;
  return min + ((index + offset) % span);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * ~24 draft cards with full, varied GenMeta — the review screen needs
 * prompt+seed visible to judge recipe quality, so these deliberately differ
 * card to card rather than being copy-pasted.
 */
function seedAdminCards(): AdminCardDto[] {
  const cards: AdminCardDto[] = [];
  let index = 0;

  for (const adjective of DRAFT_ADJECTIVES) {
    for (const noun of DRAFT_NOUNS) {
      const rarity: Rarity = RARITIES[index % RARITIES.length];
      const archetype: Archetype = ARCHETYPES[index % ARCHETYPES.length];
      const element: Element | null = index % 7 === 6 ? null : ELEMENTS[index % ELEMENTS.length];
      const name = `${adjective} ${noun}`;
      const variant = (index % 3) + 1;
      const seed = 100_000 + index * 977;

      const genMeta: GenMeta = {
        model: 'Lykon/dreamshaper-8',
        prompt: `a fantasy trading card illustration of a ${adjective.toLowerCase()} ${noun.toLowerCase()}, ${archetype} archetype${element ? `, ${element} element` : ''}, digital painting, detailed, dramatic lighting, ${rarity} rarity`,
        negativePrompt: NEGATIVE_PROMPT,
        seed,
        steps: 28,
        cfgScale: 7.5,
        sampler: 'DPMSolverMultistep',
        width: 512,
        height: 512,
        recipeId: `recipe-${archetype}-${element ?? 'neutral'}-v1`,
        generatedAt: isoHoursAgo(200 - index * 3),
      };

      cards.push({
        id: `draft-${index + 1}`,
        slug: slugify(name),
        name,
        rarity,
        element,
        archetype,
        attack: draftStat(rarity, index, 0),
        defense: draftStat(rarity, index, 2),
        flavorText: null,
        thumbUrl: `/mock/thumbs/${rarity}-${variant}.svg`,
        imageUrl: `/mock/art/${rarity}-${variant}.svg`,
        status: 'draft',
        setId: null,
        genMeta,
        createdAt: isoHoursAgo(190 - index * 3),
      });

      index++;
    }
  }

  return cards;
}

/**
 * Two ready-made accounts so mock mode (`VITE_USE_MOCKS=1`) can be logged
 * into immediately instead of forcing a registration round-trip first —
 * one of each role, since the whole point of seeding an admin account is
 * exercising the /admin gate without the offline `account:bind` CLI this
 * mock has no equivalent of.
 */
function seedAuthUsers(): MockAuthUser[] {
  return [
    { id: 'mock-player-1', displayName: 'Molo', email: 'player@example.com', password: 'password123', role: 'player' },
    { id: 'mock-admin-1', displayName: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' },
  ];
}

function createSeed(): MockDb {
  return {
    balance: { ...INITIAL_GRANT },
    ownedInstances: seedOwnedInstances(),
    drops: seedDrops(),
    pityCounter: 0,
    casesOpened: 0,
    dailyBonusAvailableAt: null,
    adminCards: seedAdminCards(),
    authUsers: seedAuthUsers(),
    documentedCardIds: [],
    archivePasses: [],
  };
}

export const db: MockDb = createSeed();

/** Restores the seed state in place — tests rely on this between cases. */
export function resetDb(): void {
  Object.assign(db, createSeed());
}
