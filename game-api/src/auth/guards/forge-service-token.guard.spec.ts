import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { RequestWithPlayer } from '../types';
import { ForgeServiceTokenGuard } from './forge-service-token.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers } as unknown as RequestWithPlayer;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('ForgeServiceTokenGuard', () => {
  function makeGuard(token: string | null): ForgeServiceTokenGuard {
    const config = { get: () => token } as unknown as ConfigService<AppConfig, true>;
    return new ForgeServiceTokenGuard(config);
  }

  it('accepts only the configured X-Service-Token', () => {
    expect(makeGuard('worker-secret').canActivate(makeContext({ 'x-service-token': 'worker-secret' }))).toBe(true);
  });

  it.each([
    ['no token', {}],
    ['wrong token', { 'x-service-token': 'not-it' }],
    ['admin bearer token', { authorization: 'Bearer an-admin-jwt' }],
  ])('rejects %s', (_name, headers) => {
    expect(() => makeGuard('worker-secret').canActivate(makeContext(headers))).toThrow(ForbiddenException);
  });
});
