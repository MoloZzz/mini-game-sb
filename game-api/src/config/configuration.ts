import { resolve } from 'path';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  storageDir: string;
  staticBaseUrl: string;
  exposeGenMeta: boolean;
  nodeEnv: string;
  /**
   * Signs and verifies every access token (part A auth). NO fallback default:
   * a default secret is identical to having no auth at all, so the app must
   * refuse to start rather than silently sign tokens with a known value.
   */
  jwtSecret: string;
  /** Origins allowed by CORS — the game-ui dev server by default. */
  corsOrigins: string[];
  /** Interface the HTTP server binds to. */
  apiHost: string;
  /** Shared secret `card-forge` sends as `X-Service-Token`. No default — unset means every service-token request is rejected. */
  forgeServiceToken: string | null;
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

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) return ['http://localhost:5173'];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export default (): AppConfig => {
  const storageDirRaw = process.env.STORAGE_DIR ?? '../storage';
  const storageDir = resolve(process.cwd(), storageDirRaw);

  // No fallback default: a default JWT secret is identical to having no
  // auth at all (anyone can forge a valid token). Refuse to start instead.
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is required — refusing to start without it');
  }

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
    jwtSecret,
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
    apiHost: process.env.API_HOST ?? '127.0.0.1',
    forgeServiceToken: process.env.FORGE_SERVICE_TOKEN ?? null,
  };
};
