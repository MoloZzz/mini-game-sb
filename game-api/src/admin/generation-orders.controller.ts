import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { ForgeGenerationOrderDto, GenerationOrderDto } from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServiceTokenGuard } from '../auth/guards/service-token.guard';
import { ForgeServiceTokenGuard } from '../auth/guards/forge-service-token.guard';
import type { CurrentPlayerPayload } from '../auth/types';
import { CompleteGenerationOrderDto, CreateGenerationOrderDto, FailGenerationOrderDto, SelectGenerationOrderCandidateDto, UpdateGenerationOrderDto } from './dto/generation-order.dto';
import { GenerationOrdersService } from './generation-orders.service';

/** Admin-authored work queue; forge claims and completes work with the service token. */
@Roles('admin')
@Controller('admin/generation-orders')
export class GenerationOrdersController {
  constructor(private readonly generationOrdersService: GenerationOrdersService) {}

  @Post() @HttpCode(201)
  create(@CurrentPlayer() player: CurrentPlayerPayload, @Body() body: CreateGenerationOrderDto): Promise<GenerationOrderDto> {
    return this.generationOrdersService.create(player.id, body);
  }
  @Get()
  list(): Promise<GenerationOrderDto[]> { return this.generationOrdersService.list(); }
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GenerationOrderDto> { return this.generationOrdersService.get(id); }
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateGenerationOrderDto): Promise<GenerationOrderDto> {
    return this.generationOrdersService.update(id, body);
  }
  @Post(':id/queue')
  queue(@Param('id', ParseUUIDPipe) id: string): Promise<GenerationOrderDto> { return this.generationOrdersService.queue(id); }
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<GenerationOrderDto> { return this.generationOrdersService.cancel(id); }
  @Post(':id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<GenerationOrderDto> { return this.generationOrdersService.retry(id); }
  @Post(':id/select')
  select(@Param('id', ParseUUIDPipe) id: string, @Body() body: SelectGenerationOrderCandidateDto): Promise<GenerationOrderDto> {
    return this.generationOrdersService.select(id, body);
  }

  /** Leases the oldest queued order to the local Forge worker, if one exists. */
  @Public() @Roles() @UseGuards(ForgeServiceTokenGuard) @Post('claim-next') @HttpCode(200)
  claimNext(): Promise<ForgeGenerationOrderDto | null> {
    return this.generationOrdersService.claimNext();
  }

  @Public() @Roles() @UseGuards(ServiceTokenGuard) @Post(':id/claim')
  claim(@Param('id', ParseUUIDPipe) id: string): Promise<ForgeGenerationOrderDto> { return this.generationOrdersService.claim(id); }
  @Public() @Roles() @UseGuards(ServiceTokenGuard) @Post(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() body: CompleteGenerationOrderDto): Promise<GenerationOrderDto> {
    return this.generationOrdersService.complete(id, body);
  }
  @Public() @Roles() @UseGuards(ServiceTokenGuard) @Post(':id/fail')
  fail(@Param('id', ParseUUIDPipe) id: string, @Body() body: FailGenerationOrderDto): Promise<GenerationOrderDto> {
    return this.generationOrdersService.fail(id, body.runId, body.code, body.detail);
  }
}
