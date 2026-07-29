import type { PlayerDto, PlayerRole } from '@card-game/shared-types';
import type { Request } from 'express';

/**
 * Exactly what gets signed into the access token — `sub` + `role`.
 * `iat`/`exp` are added automatically by `JwtService.sign()` (see
 * `AuthModule`'s `signOptions: { expiresIn: '7d' }`) and are optional here
 * because they are absent on the object passed INTO `sign()`, only present
 * on what `verifyAsync()` returns.
 */
export interface JwtPayload {
  sub: string;
  role: PlayerRole;
  iat?: number;
  exp?: number;
}

/** What `JwtAuthGuard` / `ServiceTokenGuard` attach to the request after verifying a token. */
export interface CurrentPlayerPayload {
  id: string;
  role: PlayerRole;
}

export interface RequestWithPlayer extends Request {
  player?: CurrentPlayerPayload;
}

export interface AuthResponse {
  token: string;
  player: PlayerDto;
}
