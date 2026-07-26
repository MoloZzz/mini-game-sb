import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AppConfig } from '../config/configuration';
import { CaseOpeningEntity, PlayerCardEntity, PlayerEntity } from '../entities';

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(CaseOpeningEntity)
    private readonly caseOpeningsRepository: Repository<CaseOpeningEntity>,
    @InjectRepository(PlayerCardEntity)
    private readonly playerCardsRepository: Repository<PlayerCardEntity>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Resolves the single local player (vault 03: no auth — `PLAYER_ID` from
   * env, or the first seeded row). Stable signature: later stages depend on
   * this method.
   */
  async getCurrentPlayer(): Promise<PlayerEntity> {
    const configuredId = this.configService.get('playerId', { infer: true });

    if (configuredId) {
      const player = await this.playersRepository.findOne({ where: { id: configuredId } });
      if (player) return player;
    }

    const [firstPlayer] = await this.playersRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    if (!firstPlayer) {
      throw new Error('no player seeded — run `npm run seed`');
    }

    return firstPlayer;
  }

  async getCurrentPlayerId(): Promise<string> {
    const player = await this.getCurrentPlayer();
    return player.id;
  }

  async countCasesOpened(playerId: string): Promise<number> {
    return this.caseOpeningsRepository.count({ where: { playerId } });
  }

  async countTotalCards(playerId: string): Promise<number> {
    return this.playerCardsRepository
      .createQueryBuilder('pc')
      .where('pc.player_id = :playerId', { playerId })
      .andWhere('pc.sold_at IS NULL')
      .getCount();
  }

  async countUniqueCards(playerId: string): Promise<number> {
    const raw = await this.playerCardsRepository
      .createQueryBuilder('pc')
      .select('COUNT(DISTINCT pc.card_id)', 'count')
      .where('pc.player_id = :playerId', { playerId })
      .andWhere('pc.sold_at IS NULL')
      .getRawOne<{ count: string }>();
    return Number(raw?.count ?? 0);
  }
}
