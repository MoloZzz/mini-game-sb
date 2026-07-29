import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { LoggingInterceptor } from './common/logging.interceptor';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CardsModule } from './cards/cards.module';
import { CasesModule } from './cases/cases.module';
import { CollectionModule } from './collection/collection.module';
import { DropsModule } from './drops/drops.module';
import { InventoryModule } from './inventory/inventory.module';
import { LedgerModule } from './ledger/ledger.module';
import { MilestonesModule } from './milestones/milestones.module';
import { PlayersModule } from './players/players.module';

/**
 * Global fail-closed auth: `JwtAuthGuard` (authenticate) then `RolesGuard`
 * (authorize) run on every route by default — order matters, `RolesGuard`
 * only reads `request.player`, which `JwtAuthGuard` is what sets it. A route
 * opts out via `@Public()` (see the allowlist across health/auth/cards/cases
 * and the ingest route's own `ServiceTokenGuard` carve-out); anything added
 * later is protected unless someone deliberately opts out.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['../.env', '.env'],
    }),
    DatabaseModule,
    HealthModule,
    AdminModule,
    AuthModule,
    CardsModule,
    CasesModule,
    PlayersModule,
    LedgerModule,
    DropsModule,
    InventoryModule,
    CollectionModule,
    MilestonesModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
