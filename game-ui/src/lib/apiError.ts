import { API_ERROR_CODES, type ApiError, type ApiErrorCode } from '@card-game/shared-types';

/**
 * Synthetic codes for failures that never reach the server: a network drop
 * or a response body that isn't valid `ApiError` JSON.
 */
export type ApiClientErrorCode = ApiErrorCode | 'NETWORK' | 'UNKNOWN';

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiClientErrorCode;
  readonly payload: unknown;

  constructor(message: string, status: number, code: ApiClientErrorCode, payload: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }

  static fromResponseBody(status: number, body: unknown): ApiClientError {
    if (isApiErrorLike(body)) {
      return new ApiClientError(body.message, status, body.code, body);
    }
    return new ApiClientError('Request failed', status, 'UNKNOWN', body);
  }

  static network(message: string): ApiClientError {
    return new ApiClientError(message, 0, 'NETWORK', undefined);
  }
}

function isApiErrorLike(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === 'string' && isApiErrorCode(record.code);
}

/**
 * Built by iterating `API_ERROR_CODES` so a new code added in shared-types
 * becomes a compile error here (missing key) rather than a silent gap.
 */
export const USER_MESSAGES: Record<ApiErrorCode, string> = {
  INSUFFICIENT_FUNDS: "Not enough funds.",
  EMPTY_POOL: "No cards of that rarity exist yet.",
  CASE_NOT_FOUND: "That case doesn't exist.",
  CARD_NOT_FOUND: "That card doesn't exist.",
  INSTANCE_NOT_FOUND: "That card copy is no longer in your inventory.",
  LAST_COPY: "Can't sell your last copy.",
  DAILY_BONUS_NOT_READY: "Daily bonus isn't ready yet.",
  CASE_INACTIVE: "That case isn't available right now.",
};
