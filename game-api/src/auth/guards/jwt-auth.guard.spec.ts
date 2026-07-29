import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../../config/configuration';
import type { RequestWithPlayer } from '../types';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'test-secret';

function makeContext(request: RequestWithPlayer): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: SECRET });
  const configService = {
    get: () => SECRET,
  } as unknown as ConfigService<AppConfig, true>;

  function makeGuard(isPublic: boolean | undefined): JwtAuthGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    return new JwtAuthGuard(jwtService, configService, reflector);
  }

  it('rejects a request with no Authorization header (401)', async () => {
    const guard = makeGuard(false);
    const context = makeContext({ headers: {} } as unknown as RequestWithPlayer);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed token (401)', async () => {
    const guard = makeGuard(false);
    const context = makeContext({
      headers: { authorization: 'Bearer not-a-real-token' },
    } as unknown as RequestWithPlayer);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token (401)', async () => {
    const guard = makeGuard(false);
    const expired = jwtService.sign({ sub: 'p1', role: 'player' }, { expiresIn: '-1s' });
    const context = makeContext({
      headers: { authorization: `Bearer ${expired}` },
    } as unknown as RequestWithPlayer);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a route marked @Public() through without a token', async () => {
    const guard = makeGuard(true);
    const context = makeContext({ headers: {} } as unknown as RequestWithPlayer);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('accepts a valid token and attaches the claims to the request', async () => {
    const guard = makeGuard(false);
    const token = jwtService.sign({ sub: 'p1', role: 'admin' });
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as RequestWithPlayer;
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.player).toEqual({ id: 'p1', role: 'admin' });
  });
});
