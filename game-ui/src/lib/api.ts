import type {
  AdminCardDto,
  AdminListCardsResponse,
  CardStatus,
  CaseDto,
  ClaimDailyBonusResponse,
  DropHistoryItemDto,
  InventoryPageDto,
  ListInventoryQuery,
  OpenCaseRequest,
  OpenCaseResponse,
  PlayerDto,
  ReviewCardRequest,
  SellCardResponse,
} from '@card-game/shared-types';

import { ApiClientError } from './apiError';

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

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      body,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
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
