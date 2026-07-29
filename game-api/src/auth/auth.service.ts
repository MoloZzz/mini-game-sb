import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DAILY_BONUS_COOLDOWN_MS, INITIAL_GRANT } from '@card-game/shared-types';
import type { PlayerDto } from '@card-game/shared-types';
import type { DataSource, Repository } from 'typeorm';
import { apiError } from '../common/api-error';
import { PlayerEntity } from '../entities';
import { LedgerService } from '../ledger/ledger.service';
import { PlayersService } from '../players/players.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password.util';
import type { AuthResponse, JwtPayload } from './types';

/** Postgres error code raised when the partial unique index on lower(email) is hit. */
const UNIQUE_VIOLATION_CODE = '23505';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PlayerEntity) private readonly playersRepository: Repository<PlayerEntity>,
    private readonly ledgerService: LedgerService,
    private readonly playersService: PlayersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * `POST /auth/register`. ONE transaction: check email -> hash password ->
   * insert the player with balances set EXPLICITLY from `INITIAL_GRANT`
   * (never a DB default — the AddPlayerAuth migration dropped those) ->
   * record the matching `initial_grant` ledger row (ADR-008) -> sign the
   * token. Structurally identical to `seedPlayer()` in `src/seed/seed.ts`.
   * Registration is the only new balance-creating HTTP path, and it goes
   * through `LedgerService` like every other one, preserving the
   * single-writer property of ADR-008.
   *
   * Registration ALWAYS assigns role `'player'` — there is no HTTP path to
   * `admin` (see `src/scripts/bind-account.ts`, the only place that can).
   *
   * The pre-check below handles the common case with a clean 409, but the
   * actual race is resolved by the catch on Postgres 23505 below: two
   * concurrent registrations for the same email can both pass the
   * pre-check, only one INSERT wins the unique index, and the loser is
   * mapped to `EMAIL_TAKEN` here instead of surfacing a raw 500.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();

    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(PlayerEntity, { where: { email } });
        if (existing) {
          apiError(409, 'EMAIL_TAKEN', `Email ${email} is already registered`);
        }

        const passwordHash = await hashPassword(dto.password);
        const now = new Date();

        const player = manager.create(PlayerEntity, {
          displayName: dto.displayName,
          email,
          passwordHash,
          role: 'player',
          balanceCoins: INITIAL_GRANT.coins,
          balanceKeys: INITIAL_GRANT.keys,
          pityCounter: 0,
          lastDailyClaimAt: null,
          lastLoginAt: now,
        });
        const savedPlayer = await manager.save(player);

        // Without this row the ledger invariant SUM(delta_coins) ==
        // balance_coins is violated from the first second (ADR-008).
        await this.ledgerService.recordTransaction(manager, {
          playerId: savedPlayer.id,
          type: 'initial_grant',
          deltaCoins: INITIAL_GRANT.coins,
          deltaKeys: INITIAL_GRANT.keys,
          refType: 'player',
          refId: savedPlayer.id,
        });

        return {
          token: this.signToken(savedPlayer),
          player: this.freshPlayerDto(savedPlayer),
        };
      });
    } catch (err) {
      if (this.isEmailUniqueViolation(err)) {
        apiError(409, 'EMAIL_TAKEN', `Email ${email} is already registered`);
      }
      throw err;
    }
  }

  /** `POST /auth/login`. */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();
    const player = await this.playersRepository.findOne({ where: { email } });

    if (!player || !player.passwordHash) {
      apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await verifyPassword(player.passwordHash, dto.password);
    if (!valid) {
      apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    player.lastLoginAt = new Date();
    await this.playersRepository.save(player);

    return {
      token: this.signToken(player),
      player: await this.toPlayerDto(player),
    };
  }

  /** `GET /auth/me` — id/role come from the already-verified JWT claims (`JwtAuthGuard`). */
  async getPlayerDto(playerId: string): Promise<PlayerDto> {
    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) {
      // The token was valid but the player row it points at is gone.
      apiError(401, 'UNAUTHORIZED', 'Player no longer exists');
    }
    return this.toPlayerDto(player);
  }

  private signToken(player: Pick<PlayerEntity, 'id' | 'role'>): string {
    const payload: JwtPayload = { sub: player.id, role: player.role };
    return this.jwtService.sign(payload);
  }

  /** A brand-new player has no drops, no cards and no daily claim yet — no need to query for it. */
  private freshPlayerDto(player: PlayerEntity): PlayerDto {
    return {
      id: player.id,
      displayName: player.displayName,
      balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      stats: { casesOpened: 0, uniqueCards: 0, totalCards: 0 },
      dailyBonusAvailableAt: null,
      pityCounter: player.pityCounter,
    };
  }

  /**
   * Mirrors `computeDailyBonusAvailableAt` + the DTO assembly in
   * `PlayersController.getMe` (deliberately duplicated, not imported — this
   * module must not modify existing controllers). Keep both in sync if the
   * daily-bonus rule ever changes.
   */
  private async toPlayerDto(player: PlayerEntity): Promise<PlayerDto> {
    const [casesOpened, totalCards, uniqueCards] = await Promise.all([
      this.playersService.countCasesOpened(player.id),
      this.playersService.countTotalCards(player.id),
      this.playersService.countUniqueCards(player.id),
    ]);

    const dailyBonusAvailableAt = player.lastDailyClaimAt
      ? this.computeDailyBonusAvailableAt(player.lastDailyClaimAt)
      : null;

    return {
      id: player.id,
      displayName: player.displayName,
      balance: { coins: player.balanceCoins, keys: player.balanceKeys },
      stats: { casesOpened, totalCards, uniqueCards },
      dailyBonusAvailableAt,
      pityCounter: player.pityCounter,
    };
  }

  private computeDailyBonusAvailableAt(lastDailyClaimAt: Date): string | null {
    const availableAt = new Date(lastDailyClaimAt.getTime() + DAILY_BONUS_COOLDOWN_MS);
    return availableAt.getTime() <= Date.now() ? null : availableAt.toISOString();
  }

  private isEmailUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === UNIQUE_VIOLATION_CODE
    );
  }
}
