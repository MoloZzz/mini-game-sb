import 'reflect-metadata';
import { createInterface } from 'readline';
import { PLAYER_ROLES } from '@card-game/shared-types';
import type { PlayerRole } from '@card-game/shared-types';
import type { DataSource } from 'typeorm';
import { hashPassword } from '../auth/password.util';
import { AppDataSource } from '../database/data-source';
import { PlayerEntity } from '../entities';

/**
 * `npm run account:bind -- --player "Molo" --email you@example.com --role admin`
 *
 * Offline-only CLI, NOT an HTTP endpoint — and deliberately so. There is no
 * "claim your account" route: an unauthenticated claim against a database
 * that already has a player row is an account-takeover primitive. This is
 * also the ONLY way an `admin` player is ever created; registration (A6)
 * always assigns `role: 'player'` server-side, with no HTTP override.
 *
 * Does NOT write to `transactions` and does NOT touch balances,
 * `player_cards` or `case_openings` — only `email` / `password_hash` /
 * `role` change. That is what keeps the ledger invariant
 * `SUM(delta_coins) == balance_coins` (ADR-008) intact by construction:
 * binding an existing row is not a balance-creating event.
 */

interface BindArgs {
  player: string | null;
  id: string | null;
  email: string;
  role: PlayerRole;
}

function parseArgs(argv: string[]): BindArgs {
  let player: string | null = null;
  let id: string | null = null;
  let email: string | null = null;
  let role: PlayerRole = 'player';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--player':
        player = argv[++i] ?? null;
        break;
      case '--id':
        id = argv[++i] ?? null;
        break;
      case '--email':
        email = argv[++i] ?? null;
        break;
      case '--role': {
        const raw = argv[++i];
        if (!raw || !(PLAYER_ROLES as readonly string[]).includes(raw)) {
          throw new Error(`--role must be one of: ${PLAYER_ROLES.join(', ')}`);
        }
        role = raw as PlayerRole;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!player && !id) {
    throw new Error('Provide exactly one of --player <displayName> or --id <uuid>');
  }
  if (player && id) {
    throw new Error('Provide exactly one of --player <displayName> or --id <uuid>, not both');
  }
  if (!email) {
    throw new Error('--email is required');
  }

  return { player, id, email, role };
}

/**
 * Reads the password from stdin rather than argv: argv would land it in
 * shell history and in `ps`/process-listing output. This is a scripting
 * tool, not an interactive prompt — pipe it in, e.g.:
 *   echo "$PASSWORD" | npm run account:bind -- --player "Molo" --email you@example.com --role admin
 */
function readPasswordFromStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    const lines: string[] = [];
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => {
      const password = lines.join('\n').trim();
      if (!password) {
        reject(new Error('No password read from stdin'));
        return;
      }
      resolvePromise(password);
    });
    rl.on('error', reject);
  });
}

async function bindAccount(dataSource: DataSource, args: BindArgs): Promise<void> {
  const playerRepo = dataSource.getRepository(PlayerEntity);

  const where = args.id ? { id: args.id } : { displayName: args.player! };
  const matches = await playerRepo.find({ where });

  if (matches.length === 0) {
    throw new Error(
      `No player matched ${args.id ? `id "${args.id}"` : `display name "${args.player}"`}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} players matched "${args.player}" — pass --id to disambiguate: ` +
        matches.map((p) => `${p.id} (${p.displayName})`).join(', '),
    );
  }

  const player = matches[0]!;

  if (player.passwordHash !== null) {
    throw new Error(
      `Player ${player.id} ("${player.displayName}") is already bound (password_hash is set) — refusing to overwrite.`,
    );
  }

  console.log('Reading password from stdin...');
  const password = await readPasswordFromStdin();
  const passwordHash = await hashPassword(password);
  const email = args.email.toLowerCase();

  // Deliberately UPDATEs only these three columns — no transactions row, no
  // balance change, no player_cards/case_openings touch (see the module
  // docstring above).
  await playerRepo.update(player.id, {
    email,
    passwordHash,
    role: args.role,
  });

  console.log(
    `Bound player ${player.id} ("${player.displayName}") to ${email} with role "${args.role}".`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await AppDataSource.initialize();
  try {
    await bindAccount(AppDataSource, args);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
