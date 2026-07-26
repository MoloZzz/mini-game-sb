import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@card-game/shared-types';

/**
 * Every non-2xx body in this API must be shaped like `ApiError` from
 * shared-types: `{ code, message, ...extra }`. This is the single place that
 * throws them, so no controller/service ever hand-rolls an error shape.
 */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): never {
  throw new HttpException({ code, message, ...extra }, status);
}

/** 404 — the requested card id does not exist. */
export function throwCardNotFound(id: string): never {
  return apiError(404, 'CARD_NOT_FOUND', `Card ${id} not found`, { id });
}

/** 404 — the requested case slug does not exist. */
export function throwCaseNotFound(slug: string): never {
  return apiError(404, 'CASE_NOT_FOUND', `Case ${slug} not found`, { slug });
}
