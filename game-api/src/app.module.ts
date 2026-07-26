import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { CardsModule } from './cards/cards.module';
import { CasesModule } from './cases/cases.module';
import { DropsModule } from './drops/drops.module';
import { InventoryModule } from './inventory/inventory.module';
import { LedgerModule } from './ledger/ledger.module';
import { PlayersModule } from './players/players.module';

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
    CardsModule,
    CasesModule,
    PlayersModule,
    LedgerModule,
    DropsModule,
    InventoryModule,
  ],
})
export class AppModule {}
