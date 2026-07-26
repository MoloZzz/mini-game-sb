import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../entities';
import { InitialSchema1785017587632 } from '../migrations/1785017587632-InitialSchema';

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
  migrations: [InitialSchema1785017587632],
  migrationsTableName: 'migrations',
});
