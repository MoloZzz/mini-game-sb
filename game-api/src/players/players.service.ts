import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { apiError } from '../common/api-error';
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
  ) {}

  /**
   * Resolves the player behind an already-verified JWT (`@CurrentPlayer()`
   * — `JwtAuthGuard` put `sub`/`role` there after checking the signature).
   * A valid token whose player row no longer exists is an AUTHENTICATION
   * failure, not a lookup miss: 401 tells the client its session is no
   * longer valid, rather than leaking whether some arbitrary id exists.
   */
  async findByIdOrFail(playerId: string): Promise<PlayerEntity> {
    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) {
      apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
    }
    return player;
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
