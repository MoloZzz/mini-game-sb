import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without a bearer token. `JwtAuthGuard` is
 * registered globally as an `APP_GUARD` in `AppModule`, so every route is
 * authenticated unless it opts out here. The allowlist is deliberately short:
 * health, both `/auth` entry points, both `/cards` routes and `GET /cases`.
 * Anything added later is protected by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
