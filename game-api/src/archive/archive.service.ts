import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  ArchivePassDto,
  ArchiveStatusDto,
  CreateArchiveDossierResponse,
  OpenArchivePassResponse,
} from '@card-game/shared-types';
import type { DataSource } from 'typeorm';
import { In, IsNull } from 'typeorm';
import { CardMapper } from '../cards/card.mapper';
import { apiError } from '../common/api-error';
import {
  ArchiveDossierEntity,
  ArchiveNoteEntity,
  ArchivePassEntity,
  PlayerCardEntity,
  PlayerEntity,
} from '../entities';
import { DropsService } from '../drops/drops.service';

@Injectable()
export class ArchiveService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cardMapper: CardMapper,
    private readonly dropsService: DropsService,
  ) {}

  /** Read-only task state: each currently owned unique card says whether it is documented. */
  async getStatus(playerId: string): Promise<ArchiveStatusDto> {
    const instances = await this.dataSource.getRepository(PlayerCardEntity).find({
      where: { playerId, soldAt: IsNull() },
      relations: { card: true },
      order: { acquiredAt: 'ASC' },
    });
    const uniqueCards = Array.from(
      new Map(instances.map((instance) => [instance.cardId, instance.card])).values(),
    );
    const documented = new Set(
      (await this.dataSource.getRepository(ArchiveNoteEntity).find({ where: { playerId } })).map(
        (note) => note.cardId,
      ),
    );
    const passes = await this.dataSource.getRepository(ArchivePassEntity).find({
      where: { playerId, consumedAt: IsNull() },
      order: { earnedAt: 'ASC' },
    });

    return {
      noteCards: uniqueCards.map((card) => ({
        card: this.cardMapper.toCardDto(card),
        documented: documented.has(card.id),
      })),
      passes: passes.map((pass) => this.toPassDto(pass)),
    };
  }

  async createDossier(playerId: string, cardIds: string[]): Promise<CreateArchiveDossierResponse> {
    if (cardIds.length !== 3 || new Set(cardIds).size !== 3) {
      apiError(400, 'ARCHIVE_INVALID_DOSSIER', 'A dossier needs exactly three different cards');
    }

    return this.dataSource.transaction(async (manager) => {
      const player = await manager
        .createQueryBuilder(PlayerEntity, 'p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: playerId })
        .getOne();
      if (!player) apiError(401, 'UNAUTHORIZED', 'Player no longer exists');

      const ownedInstances = await manager.find(PlayerCardEntity, {
        where: { playerId: player.id, cardId: In(cardIds), soldAt: IsNull() },
      });
      const ownedCardIds = new Set(ownedInstances.map((instance) => instance.cardId));
      if (ownedCardIds.size !== 3) {
        apiError(409, 'ARCHIVE_CARD_INELIGIBLE', 'Each dossier card must be owned and unsold', { cardIds });
      }

      const existingNotes = await manager.find(ArchiveNoteEntity, {
        where: { playerId: player.id, cardId: In(cardIds) },
      });
      if (existingNotes.length > 0) {
        apiError(409, 'ARCHIVE_CARD_INELIGIBLE', 'A card may only be documented once', {
          cardIds: existingNotes.map((note) => note.cardId),
        });
      }

      const dossier = await manager.save(manager.create(ArchiveDossierEntity, { playerId: player.id }));
      await manager.save(
        cardIds.map((cardId) =>
          manager.create(ArchiveNoteEntity, { playerId: player.id, dossierId: dossier.id, cardId }),
        ),
      );
      const pass = await manager.save(
        manager.create(ArchivePassEntity, {
          playerId: player.id,
          dossierId: dossier.id,
          openingId: null,
          consumedAt: null,
        }),
      );

      return { pass: this.toPassDto(pass), documentedCardIds: cardIds };
    });
  }

  async openPass(
    playerId: string,
    passId: string,
    clientSeed: string | null,
    idempotencyKey: string | null,
  ): Promise<OpenArchivePassResponse> {
    return this.dropsService.openArchivePass(playerId, passId, clientSeed, idempotencyKey);
  }

  private toPassDto(pass: ArchivePassEntity): ArchivePassDto {
    return { id: pass.id, earnedAt: pass.earnedAt.toISOString() };
  }
}
