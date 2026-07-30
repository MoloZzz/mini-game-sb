import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration';
import { PlayerEntity } from '../entities';
import { LedgerModule } from '../ledger/ledger.module';
import { PlayersModule } from '../players/players.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ForgeServiceTokenGuard } from './guards/forge-service-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { ServiceTokenGuard } from './guards/service-token.guard';

/**
 * --- Transport trade-off (read before changing anything here) ---
 *
 * A single access token is handed to the client on register/login and is
 * expected to live in `localStorage`, sent back as
 * `Authorization: Bearer <token>`. httpOnly cookies were considered and
 * rejected for this stage: game-ui (5173) and game-api (3000) are different
 * origins, so cookies would require `credentials: true`, an explicit CORS
 * allowlist (already true here via `corsOrigins`) AND real CSRF protection
 * — a `SameSite` cookie alone is not enough once two distinct origins are
 * involved. That is meaningful extra work for a game that only ever runs on
 * localhost today, so it was deferred.
 *
 * If this API is ever exposed beyond localhost, swap this for httpOnly
 * cookies + CSRF tokens + a much shorter access-token TTL — the 7-day TTL
 * used here is only acceptable because the token never leaves one machine
 * and there is exactly one operator.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PlayerEntity]),
    LedgerModule,
    PlayersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('jwtSecret', { infer: true }),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, ServiceTokenGuard, ForgeServiceTokenGuard],
  // JwtModule is re-exported (not just imported) so any module that imports
  // AuthModule — AppModule for the global APP_GUARD registration, AdminModule
  // for ServiceTokenGuard's @UseGuards() — can fully resolve these guards'
  // constructor dependencies, not just see the guard classes themselves.
  exports: [JwtAuthGuard, RolesGuard, ServiceTokenGuard, ForgeServiceTokenGuard, JwtModule],
})
export class AuthModule {}
