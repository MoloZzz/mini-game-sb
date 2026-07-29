import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { CurrentPlayerPayload, RequestWithPlayer } from '../types';

/**
 * Reads the claims `JwtAuthGuard` (or `ServiceTokenGuard`'s admin-JWT path)
 * attached to the request. Only valid on routes actually guarded by one of
 * those — using it elsewhere is a wiring bug, so it throws rather than
 * returning `undefined` silently.
 */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentPlayerPayload => {
    const request = ctx.switchToHttp().getRequest<RequestWithPlayer>();
    if (!request.player) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '@CurrentPlayer() used on a route with no auth guard attaching a player',
      });
    }
    return request.player;
  },
);
