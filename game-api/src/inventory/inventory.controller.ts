import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type {
  ClaimDailyBonusResponse,
  DropHistoryItemDto,
  InventoryPageDto,
  SellBulkResponse,
  SellCardResponse,
} from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { ListDropsQueryDto } from './dto/list-drops.query';
import { ListInventoryQueryDto } from './dto/list-inventory.query';
import { SellBulkRequestDto } from './dto/sell-bulk.dto';
import { InventoryService } from './inventory.service';

/**
 * Player-facing economy endpoints (A7). Shares the `me` base path with
 * `PlayersController` (`GET /api/me`) — routes are disjoint (`inventory`,
 * `daily-bonus`, `drops`), so both controllers coexist without collision.
 */
@Controller('me')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('inventory')
  async listInventory(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Query() query: ListInventoryQueryDto,
  ): Promise<InventoryPageDto> {
    return this.inventoryService.listInventory(playerId, query);
  }

  @Post('inventory/:instanceId/sell')
  @HttpCode(200)
  async sellCard(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
  ): Promise<SellCardResponse> {
    return this.inventoryService.sellCard(playerId, instanceId);
  }

  @Post('inventory/sell-bulk')
  @HttpCode(200)
  async sellBulk(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Body() body: SellBulkRequestDto,
  ): Promise<SellBulkResponse> {
    return this.inventoryService.sellBulk(playerId, body);
  }

  @Post('daily-bonus')
  @HttpCode(200)
  async claimDailyBonus(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
  ): Promise<ClaimDailyBonusResponse> {
    return this.inventoryService.claimDailyBonus(playerId);
  }

  @Get('drops')
  async listDrops(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Query() query: ListDropsQueryDto,
  ): Promise<DropHistoryItemDto[]> {
    return this.inventoryService.listDrops(playerId, query.limit);
  }
}
