import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlayerRole } from '@card-game/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestWithPlayer } from '../types';

/**
 * Must run AFTER `JwtAuthGuard` (or `ServiceTokenGuard`'s admin-JWT path) —
 * it only reads `request.player`, never verifies a token itself.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlayerRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithPlayer>();
    const player = request.player;

    if (!player || !requiredRoles.includes(player.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient role' });
    }

    return true;
  }
}
