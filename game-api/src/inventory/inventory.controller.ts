import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type {
  ClaimDailyBonusResponse,
  DropHistoryItemDto,
  InventoryPageDto,
  SellCardResponse,
} from '@card-game/shared-types';
import { PlayersService } from '../players/players.service';
import { ListDropsQueryDto } from './dto/list-drops.query';
import { ListInventoryQueryDto } from './dto/list-inventory.query';
import { InventoryService } from './inventory.service';

/**
 * Player-facing economy endpoints (A7). Shares the `me` base path with
 * `PlayersController` (`GET /api/me`) — routes are disjoint (`inventory`,
 * `daily-bonus`, `drops`), so both controllers coexist without collision.
 */
@Controller('me')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly playersService: PlayersService,
  ) {}

  @Get('inventory')
  async listInventory(@Query() query: ListInventoryQueryDto): Promise<InventoryPageDto> {
    const playerId = await this.playersService.getCurrentPlayerId();
    return this.inventoryService.listInventory(playerId, query);
  }

  @Post('inventory/:instanceId/sell')
  @HttpCode(200)
  async sellCard(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
  ): Promise<SellCardResponse> {
    const playerId = await this.playersService.getCurrentPlayerId();
    return this.inventoryService.sellCard(playerId, instanceId);
  }

  @Post('daily-bonus')
  @HttpCode(200)
  async claimDailyBonus(): Promise<ClaimDailyBonusResponse> {
    const playerId = await this.playersService.getCurrentPlayerId();
    return this.inventoryService.claimDailyBonus(playerId);
  }

  @Get('drops')
  async listDrops(@Query() query: ListDropsQueryDto): Promise<DropHistoryItemDto[]> {
    const playerId = await this.playersService.getCurrentPlayerId();
    return this.inventoryService.listDrops(playerId, query.limit);
  }
}
