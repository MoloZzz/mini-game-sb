import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import type {
  ArchiveStatusDto,
  CreateArchiveDossierResponse,
  OpenArchivePassResponse,
} from '@card-game/shared-types';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import type { CurrentPlayerPayload } from '../auth/types';
import { OpenCaseRequestDto } from '../drops/dto/open-case.dto';
import { CreateArchiveDossierDto } from './dto/create-archive-dossier.dto';
import { ArchiveService } from './archive.service';

@Controller('me/archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get()
  getStatus(@CurrentPlayer() { id: playerId }: CurrentPlayerPayload): Promise<ArchiveStatusDto> {
    return this.archiveService.getStatus(playerId);
  }

  @Post('dossiers')
  @HttpCode(201)
  createDossier(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Body() body: CreateArchiveDossierDto,
  ): Promise<CreateArchiveDossierResponse> {
    return this.archiveService.createDossier(playerId, body.cardIds);
  }

  @Post('passes/:passId/open')
  @HttpCode(200)
  openPass(
    @CurrentPlayer() { id: playerId }: CurrentPlayerPayload,
    @Param('passId') passId: string,
    @Body() body: OpenCaseRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OpenArchivePassResponse> {
    return this.archiveService.openPass(playerId, passId, body.clientSeed ?? null, idempotencyKey ?? null);
  }
}
