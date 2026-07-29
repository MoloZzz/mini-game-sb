import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { ALL_ENTITIES } from '../entities';
import { InitialSchema1785017587632 } from '../migrations/1785017587632-InitialSchema';
import { WidenCardArchetypeEnum1785071982473 } from '../migrations/1785071982473-WidenCardArchetypeEnum';
import { AddPlayerAuth1785147378230 } from '../migrations/1785147378230-AddPlayerAuth';
import { AddPlayerMilestones1785200000000 } from '../migrations/1785200000000-AddPlayerMilestones';
import { UpdateStoneheartCofferPrice1785200000001 } from '../migrations/1785200000001-UpdateStoneheartCofferPrice';
import { AddLedgerInvariantTrigger1785200000002 } from '../migrations/1785200000002-AddLedgerInvariantTrigger';
import { AddCaseSetScope1785300000000 } from '../migrations/1785300000000-AddCaseSetScope';
import { AddArchiveDossiers1785400000000 } from '../migrations/1785400000000-AddArchiveDossiers';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: configService.get('databaseUrl', { infer: true }),
        synchronize: false,
        logging: false,
        entities: ALL_ENTITIES,
        migrations: [
          InitialSchema1785017587632,
          WidenCardArchetypeEnum1785071982473,
          AddPlayerAuth1785147378230,
          AddPlayerMilestones1785200000000,
          UpdateStoneheartCofferPrice1785200000001,
          AddLedgerInvariantTrigger1785200000002,
          AddCaseSetScope1785300000000,
          AddArchiveDossiers1785400000000,
        ],
      }),
    }),
  ],
})
export class DatabaseModule {}
