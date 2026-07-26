import { resolve } from 'path';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  storageDir: string;
  staticBaseUrl: string;
  exposeGenMeta: boolean;
  nodeEnv: string;
  /** Explicit "auth" for a single local player (vault 03). Falls back to the first seeded row. */
  playerId: string | null;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return defaultValue;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export default (): AppConfig => {
  const storageDirRaw = process.env.STORAGE_DIR ?? '../storage';
  const storageDir = resolve(process.cwd(), storageDirRaw);

  return {
    port: process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3000,
    databaseUrl:
      process.env.DATABASE_URL ?? 'postgres://cardgame:cardgame@localhost:5432/cardgame',
    storageDir,
    staticBaseUrl: stripTrailingSlash(
      process.env.STATIC_BASE_URL ?? 'http://localhost:3000/static',
    ),
    exposeGenMeta: parseBoolean(process.env.EXPOSE_GEN_META, true),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    playerId: process.env.PLAYER_ID ?? null,
  };
};
