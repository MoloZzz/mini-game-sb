import { Body, Controller, HttpCode, Headers, Param, Post } from '@nestjs/common';
import type { OpenCaseResponse } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { OpenCaseRequestDto } from './dto/open-case.dto';
import { DropsService } from './drops.service';

/**
 * Separate controller from `CasesController` (`GET /cases`) — Nest is fine
 * with two controllers sharing the `cases` path prefix as long as the routes
 * themselves don't collide.
 */
@Controller('cases')
export class DropsController {
  constructor(private readonly dropsService: DropsService) {}

  @Post(':slug/open')
  @HttpCode(200)
  async open(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Param('slug') slug: string,
    @Body() body: OpenCaseRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OpenCaseResponse> {
    return this.dropsService.openCase(playerId, slug, body.clientSeed ?? null, idempotencyKey ?? null);
  }
}
