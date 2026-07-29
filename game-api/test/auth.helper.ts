import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { PlayerEntity } from '../src/entities';

/**
 * Shared across every e2e suite that needs an authenticated caller. Registers
 * real player rows through the real HTTP endpoints rather than reusing the
 * single seeded 'Molo' player, so suites stop depending on seed state/order
 * (see the ledger-invariant.e2e-spec.ts rewrite this helper enables).
 */
export interface TestAccount {
  playerId: string;
  token: string;
  email: string;
  displayName: string;
  password: string;
}

// Monotonic per-process counter, folded into the email so two calls in the
// same millisecond (very possible — this runs fast) never collide.
let sequence = 0;

function nextEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.com`;
}

/**
 * `POST /api/auth/register`. This is the ONLY new balance-creating HTTP path
 * (see auth.e2e-spec.ts) — going through it for every test player, instead of
 * inserting a row directly, is what keeps every suite's fixtures ledger-
 * consistent (`SUM(delta_coins) == balance_coins`) for free.
 *
 * `emailPrefix` lets each suite namespace its fixtures the same way
 * admin.e2e-spec.ts's `SLUG_PREFIX` namespaces card slugs — pass a
 * suite-specific prefix and clean up with `deleteTestPlayers` in `afterAll`.
 */
export async function createTestPlayer(
  app: NestExpressApplication,
  options: { emailPrefix?: string; displayName?: string; password?: string } = {},
): Promise<TestAccount> {
  const email = nextEmail(options.emailPrefix ?? 'test-player');
  const displayName = options.displayName ?? `TestPlayer${sequence}`;
  const password = options.password ?? 'correct-horse-battery-staple';

  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ displayName, email, password });

  if (res.status !== 201) {
    throw new Error(
      `createTestPlayer: POST /api/auth/register failed with ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  return {
    playerId: res.body.player.id as string,
    token: res.body.token as string,
    email,
    displayName,
    password,
  };
}

/**
 * There is deliberately no HTTP path to `admin` — `AuthService.register`
 * always assigns `role: 'player'`, and the only way to create an admin is
 * the offline `npm run account:bind` CLI (`src/scripts/bind-account.ts`),
 * which UPDATEs `role` directly via the DataSource on an already-existing
 * player row and touches nothing else (no balance/ledger change).
 *
 * Two ways to get an admin-scoped token in a test were considered:
 *   1. Sign a `{ sub, role: 'admin' }` JWT by hand with `JwtService`.
 *   2. Mirror `bind-account.ts` exactly: register a normal player over real
 *      HTTP, UPDATE `role` to 'admin' directly via the DataSource (same
 *      single column that CLI touches), then log back in over HTTP so the
 *      token comes from the real `AuthService.login` -> `signToken` path.
 *
 * (2) is what this does. Hand-signing (1) is faster but ties the test to an
 * assumption about the claim shape (`sub`/`role`) and signing options
 * (secret, `expiresIn`) that live in `AuthService`/`AuthModule` — if either
 * ever drifts, a hand-signed token would silently stop matching what
 * `AuthService.login` actually issues, and the test would keep passing for
 * the wrong reason. Going through `login()` for real means this test breaks
 * the moment that drift happens, which is the point of an e2e suite.
 */
export async function createTestAdmin(
  app: NestExpressApplication,
  dataSource: DataSource,
  options: { emailPrefix?: string; displayName?: string; password?: string } = {},
): Promise<TestAccount> {
  const player = await createTestPlayer(app, { emailPrefix: options.emailPrefix ?? 'test-admin', ...options });

  // Mirrors bind-account.ts: only `role` changes, no balance/ledger touch.
  await dataSource.getRepository(PlayerEntity).update(player.playerId, { role: 'admin' });

  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: player.email, password: player.password });

  if (res.status !== 200) {
    throw new Error(
      `createTestAdmin: re-login after promotion failed with ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  return {
    playerId: player.playerId,
    token: res.body.token as string,
    email: player.email,
    displayName: player.displayName,
    password: player.password,
  };
}

/**
 * Deletes every player row whose email starts with `emailPrefix` — the
 * standard teardown for suites that create fixtures via `createTestPlayer`/
 * `createTestAdmin`. `transactions`, `player_cards` and `case_openings` all
 * declare `player_id` as `ON DELETE CASCADE` (see InitialSchema migration),
 * so this alone restores the exact baseline with no separate cleanup needed.
 */
export async function deleteTestPlayers(dataSource: DataSource, emailPrefix: string): Promise<void> {
  await dataSource.query('DELETE FROM players WHERE email LIKE $1', [`${emailPrefix}%`]);
}
