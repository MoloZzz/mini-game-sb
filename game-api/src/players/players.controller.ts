import { Controller, Get } from '@nestjs/common';
import { DAILY_BONUS_COOLDOWN_MS } from '@card-game/shared-types';
import type { PlayerDto } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { PlayersService } from './players.service';

/**
 * `null` when the bonus is claimable right now: either it was never claimed,
 * or the cooldown since the last claim has already elapsed. Otherwise the
 * ISO timestamp of when it next becomes claimable.
 */
function computeDailyBonusAvailableAt(lastDailyClaimAt: Date | null): string | null {
  if (!lastDailyClaimAt) return null;
  const availableAt = new Date(lastDailyClaimAt.getTime() + DAILY_BONUS_COOLDOWN_MS);
  return availableAt.getTime() <= Date.now() ? null : availableAt.toISOString();
}

@Controller('me')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  async getMe(@CurrentPlayer() { id: playerId }: CurrentPlayerPayload): Promise<PlayerDto> {
    const player = await this.playersService.findByIdOrFail(playerId);

    const [casesOpened, totalCards, uniqueCards] = await Promise.all([
      this.playersService.countCasesOpened(player.id),
      this.playersService.countTotalCards(player.id),
      this.playersService.countUniqueCards(player.id),
    ]);

    const dailyBonusAvailableAt = computeDailyBonusAvailableAt(player.lastDailyClaimAt);

    return {
      id: player.id,
      displayName: player.displayName,
      balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      stats: { casesOpened, totalCards, uniqueCards },
      dailyBonusAvailableAt,
      pityCounter: player.pityCounter,
    };
  }
}
