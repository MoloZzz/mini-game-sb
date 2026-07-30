import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { AppConfig } from '../../config/configuration';
import type { RequestWithPlayer } from '../types';

/**
 * Machine-only guard for endpoints a human administrator must not invoke.
 * Unlike ServiceTokenGuard, this deliberately does not fall back to an admin
 * JWT: a worker is the only actor allowed to lease queued Forge work.
 */
@Injectable()
export class ForgeServiceTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPlayer>();
    const expected = this.configService.get('forgeServiceToken', { infer: true });
    const provided = request.headers['x-service-token'];
    if (!expected || typeof provided !== 'string' || provided.length === 0) {
      throw this.forbidden();
    }

    const expectedDigest = createHash('sha256').update(expected).digest();
    const providedDigest = createHash('sha256').update(provided).digest();
    if (!timingSafeEqual(expectedDigest, providedDigest)) throw this.forbidden();
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Valid X-Service-Token required',
    });
  }
}
