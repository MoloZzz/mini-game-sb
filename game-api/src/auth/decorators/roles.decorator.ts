import { SetMetadata } from '@nestjs/common';
import type { PlayerRole } from '@card-game/shared-types';

export const ROLES_KEY = 'roles';

/** Read by `RolesGuard`, which must run AFTER `JwtAuthGuard` (it reads `request.player`). */
export const Roles = (...roles: PlayerRole[]) => SetMetadata(ROLES_KEY, roles);
