import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import type { AppConfig } from '../../config/configuration';
import type { CurrentPlayerPayload, JwtPayload, RequestWithPlayer } from '../types';

/**
 * Guards the card-forge ingest endpoint. Two ways in: the static
 * `X-Service-Token` header (card-forge — a machine client with no concept
 * of a player), or a valid admin JWT (a human operator hitting the same
 * endpoint from a browser/curl). Anything else is rejected — this guard
 * must never fail open.
 *
 * `FORGE_SERVICE_TOKEN` unset -> the header path is always rejected
 * regardless of what header value is sent, no exceptions.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPlayer>();

    if (this.hasValidServiceToken(request)) {
      return true;
    }

    const player = await this.tryVerifyAdminToken(request);
    if (player) {
      request.player = player;
      return true;
    }

    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Valid X-Service-Token or admin token required',
    });
  }

  private hasValidServiceToken(request: RequestWithPlayer): boolean {
    const expected = this.configService.get('forgeServiceToken', { infer: true });
    if (!expected) return false; // unset -> never fail open, no matter what header arrives

    const provided = request.headers['x-service-token'];
    if (typeof provided !== 'string' || provided.length === 0) return false;

    // Hash both sides first so the buffers compared are always the same
    // fixed length (32 bytes, sha256) — timingSafeEqual throws on a length
    // mismatch, which comparing the raw strings directly could hit.
    const expectedDigest = createHash('sha256').update(expected).digest();
    const providedDigest = createHash('sha256').update(provided).digest();
    return timingSafeEqual(expectedDigest, providedDigest);
  }

  private async tryVerifyAdminToken(
    request: RequestWithPlayer,
  ): Promise<CurrentPlayerPayload | null> {
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    if (!token) return null;

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwtSecret', { infer: true }),
      });
      return payload.role === 'admin' ? { id: payload.sub, role: payload.role } : null;
    } catch {
      return null;
    }
  }
}
