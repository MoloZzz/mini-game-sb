import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../entities';
import { InitialSchema1785017587632 } from '../migrations/1785017587632-InitialSchema';
import { WidenCardArchetypeEnum1785071982473 } from '../migrations/1785071982473-WidenCardArchetypeEnum';
import { AddPlayerAuth1785147378230 } from '../migrations/1785147378230-AddPlayerAuth';
import { AddPlayerMilestones1785200000000 } from '../migrations/1785200000000-AddPlayerMilestones';
import { UpdateStoneheartCofferPrice1785200000001 } from '../migrations/1785200000001-UpdateStoneheartCofferPrice';
import { AddLedgerInvariantTrigger1785200000002 } from '../migrations/1785200000002-AddLedgerInvariantTrigger';
import { AddCaseSetScope1785300000000 } from '../migrations/1785300000000-AddCaseSetScope';

// Load repo-root .env first, then a local game-api/.env, both optional.
loadDotenv({ path: resolve(__dirname, '../../../.env') });
loadDotenv({ path: resolve(__dirname, '../../.env') });

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://cardgame:cardgame@localhost:5432/cardgame';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
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
  ],
  migrationsTableName: 'migrations',
});
