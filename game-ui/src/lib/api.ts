import type {
  AdminCardDto,
  AdminListCardsResponse,
  ArchiveStatusDto,
  CardStatus,
  CaseDto,
  ClaimDailyBonusResponse,
  CollectionCardsResponse,
  CollectionGoalDto,
  CollectionProgressDto,
  CreateArchiveDossierResponse,
  CreateGenerationOrderRequest,
  DropHistoryItemDto,
  InventoryPageDto,
  ListCollectionCardsQuery,
  ListInventoryQuery,
  OpenCaseRequest,
  OpenCaseResponse,
  OpenArchivePassResponse,
  PlayerDto,
  ReviewCardRequest,
  GenerationOrderDto,
  SelectGenerationOrderCandidateRequest,
  SellCardResponse,
} from '@card-game/shared-types';

import { ApiClientError } from './apiError';
import { clearToken, dispatchLogout, getToken } from './auth';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

interface RequestOptions extends RequestInit {
  query?: Record<string, string | number | undefined>;
}

// Joined by hand (not `new URL`) because the WHATWG URL constructor rejects a
// relative base like the '/api' fallback — it requires an absolute base or
// none at all, which a same-origin dev/test setup won't always have.
function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const base = BASE_URL.replace(/\/+$/, '');
  const trimmedPath = path.replace(/^\/+/, '');
  let url = `${base}/${trimmedPath}`;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs.length > 0) url += `?${qs}`;
  }

  return url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, body, ...rest } = options;
  const url = buildUrl(path, query);
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      body,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed';
    throw ApiClientError.network(message);
  }

  const text = await response.text();
  const parsed: unknown = text.length > 0 ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    // 401 clears the stored token and fires the logout event right here —
    // once, synchronously, with no follow-up request of any kind. That's
    // what keeps this a dead end instead of a cycle: nothing here re-calls
    // `request()`, so there is no way for this branch to trigger itself
    // again. `AuthProvider` reacts to the event by dropping its player state
    // (also without issuing a request), and the router takes it from there.
    if (response.status === 401) {
      clearToken();
      dispatchLogout();
    }
    throw ApiClientError.fromResponseBody(response.status, parsed);
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function getCases(): Promise<CaseDto[]> {
  return request<CaseDto[]>('/cases');
}

export function openCase(
  slug: string,
  body?: OpenCaseRequest,
  idempotencyKey?: string,
): Promise<OpenCaseResponse> {
  return request<OpenCaseResponse>(`/cases/${encodeURIComponent(slug)}/open`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function getMe(): Promise<PlayerDto> {
  return request<PlayerDto>('/me');
}

export function getInventory(q?: ListInventoryQuery): Promise<InventoryPageDto> {
  return request<InventoryPageDto>('/me/inventory', {
    query: {
      rarity: q?.rarity,
      element: q?.element,
      sort: q?.sort,
      page: q?.page,
      limit: q?.limit,
    },
  });
}

export function getCollectionProgress(): Promise<CollectionProgressDto> {
  return request<CollectionProgressDto>('/me/collection');
}

export function getCollectionGoal(): Promise<CollectionGoalDto | null> {
  return request<CollectionGoalDto | null>('/me/collection/goal');
}

export function getCollectionCards(q?: ListCollectionCardsQuery): Promise<CollectionCardsResponse> {
  return request<CollectionCardsResponse>('/me/collection/cards', {
    query: {
      rarity: q?.rarity,
      element: q?.element,
      archetype: q?.archetype,
      page: q?.page,
      limit: q?.limit,
    },
  });
}

/** Archive Notes are a task-state API, intentionally separate from collection progress. */
export function getArchive(): Promise<ArchiveStatusDto> {
  return request<ArchiveStatusDto>('/me/archive');
}

export function createArchiveDossier(cardIds: [string, string, string]): Promise<CreateArchiveDossierResponse> {
  return request<CreateArchiveDossierResponse>('/me/archive/dossiers', {
    method: 'POST',
    body: JSON.stringify({ cardIds }),
  });
}

export function openArchivePass(passId: string, idempotencyKey?: string): Promise<OpenArchivePassResponse> {
  return request<OpenArchivePassResponse>(`/me/archive/passes/${encodeURIComponent(passId)}/open`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function sellInstance(instanceId: string): Promise<SellCardResponse> {
  return request<SellCardResponse>(`/me/inventory/${encodeURIComponent(instanceId)}/sell`, {
    method: 'POST',
  });
}

export function getDrops(limit = 20): Promise<DropHistoryItemDto[]> {
  return request<DropHistoryItemDto[]>('/me/drops', { query: { limit } });
}

export function claimDailyBonus(): Promise<ClaimDailyBonusResponse> {
  return request<ClaimDailyBonusResponse>('/me/daily-bonus', { method: 'POST' });
}

export function getAdminCards(q?: {
  status?: CardStatus;
  page?: number;
  limit?: number;
}): Promise<AdminListCardsResponse> {
  return request<AdminListCardsResponse>('/admin/cards', {
    query: { status: q?.status, page: q?.page, limit: q?.limit },
  });
}

export function reviewCard(id: string, body: ReviewCardRequest): Promise<AdminCardDto> {
  return request<AdminCardDto>(`/admin/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function getGenerationOrders(): Promise<GenerationOrderDto[]> {
  return request<GenerationOrderDto[]>('/admin/generation-orders');
}

export function createGenerationOrder(body: CreateGenerationOrderRequest): Promise<GenerationOrderDto> {
  return request<GenerationOrderDto>('/admin/generation-orders', { method: 'POST', body: JSON.stringify(body) });
}

export function queueGenerationOrder(id: string): Promise<GenerationOrderDto> {
  return request<GenerationOrderDto>(`/admin/generation-orders/${encodeURIComponent(id)}/queue`, { method: 'POST' });
}

export function selectGenerationOrderCandidate(
  orderId: string,
  body: SelectGenerationOrderCandidateRequest,
): Promise<GenerationOrderDto> {
  return request<GenerationOrderDto>(`/admin/generation-orders/${encodeURIComponent(orderId)}/select`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

// --- Auth ---
//
// Not sourced from `@card-game/shared-types` — the register/login contract
// hasn't landed there yet, so these mirror `AuthResponse` from
// `game-api/src/auth/types.ts` by hand. Move them into shared-types instead
// of duplicating further once that package exposes them.

export interface AuthResponse {
  token: string;
  player: PlayerDto;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export function register(body: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function login(body: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * `GET /auth/me` — distinct from `getMe()` above (`GET /me`, the
 * stats/balance endpoint owned by `PlayersController`). This one exists to
 * verify a stored token is still good and to learn who it belongs to.
 */
export function getAuthMe(): Promise<PlayerDto> {
  return request<PlayerDto>('/auth/me');
}
