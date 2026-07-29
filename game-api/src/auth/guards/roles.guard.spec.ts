import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithPlayer } from '../types';
import { RolesGuard } from './roles.guard';

function makeContext(player: RequestWithPlayer['player']): ExecutionContext {
  const request = { player } as RequestWithPlayer;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredRoles: string[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('rejects a "player" role on an @Roles("admin") route (403)', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ id: 'p1', role: 'player' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an "admin" role on an @Roles("admin") route', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext({ id: 'p1', role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when no player is attached to the request at all', () => {
    const guard = makeGuard(['admin']);
    const context = makeContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows any authenticated player through when the route has no @Roles()', () => {
    const guard = makeGuard(undefined);
    const context = makeContext({ id: 'p1', role: 'player' });
    expect(guard.canActivate(context)).toBe(true);
  });
});
