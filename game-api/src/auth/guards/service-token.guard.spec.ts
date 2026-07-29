import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../../config/configuration';
import type { RequestWithPlayer } from '../types';
import { ServiceTokenGuard } from './service-token.guard';

const SECRET = 'test-secret';

function makeContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: RequestWithPlayer;
} {
  const request = { headers } as unknown as RequestWithPlayer;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ServiceTokenGuard', () => {
  const jwtService = new JwtService({ secret: SECRET });

  function makeGuard(forgeServiceToken: string | null): ServiceTokenGuard {
    const configService = {
      get: (key: string) => (key === 'forgeServiceToken' ? forgeServiceToken : SECRET),
    } as unknown as ConfigService<AppConfig, true>;
    return new ServiceTokenGuard(configService, jwtService);
  }

  it('accepts the correct X-Service-Token', async () => {
    const guard = makeGuard('correct-token');
    const { context } = makeContext({ 'x-service-token': 'correct-token' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects the wrong X-Service-Token (403)', async () => {
    const guard = makeGuard('correct-token');
    const { context } = makeContext({ 'x-service-token': 'wrong-token' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects every request when FORGE_SERVICE_TOKEN is unset — fail-closed, never 200', async () => {
    const guard = makeGuard(null);
    const { context } = makeContext({ 'x-service-token': 'anything-at-all' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('also accepts a request carrying a valid admin JWT instead of a service token', async () => {
    const guard = makeGuard('correct-token');
    const token = jwtService.sign({ sub: 'admin-1', role: 'admin' });
    const { context, request } = makeContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.player).toEqual({ id: 'admin-1', role: 'admin' });
  });

  it('rejects a valid but non-admin JWT (403)', async () => {
    const guard = makeGuard('correct-token');
    const token = jwtService.sign({ sub: 'player-1', role: 'player' });
    const { context } = makeContext({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
