import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RARITIES } from '@card-game/shared-types';
import type { Rarity } from '@card-game/shared-types';
import type { DataSource } from 'typeorm';

/** How long a fetched approved-pool count is trusted before the next read re-queries. */
const MEMO_TTL_MS = 60_000;

interface Memo {
  counts: Record<Rarity, number>;
  fetchedAt: number;
}

/**
 * The real source of truth for collection totals: `COUNT(*)` of
 * `status = 'approved'` cards per rarity, straight from the `cards` table.
 * Never a hardcoded constant — a card approved through the admin review
 * queue must be reflected here without a deploy.
 *
 * In-process memo only (ADR-009: single Node process, no Redis). A 60s TTL
 * bounds staleness for the common case (nothing changed since the last
 * read); `invalidate()` lets the admin ingest/review paths force a fresh
 * read the moment the approved pool actually changes.
 */
@Injectable()
export class PoolService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private memo: Memo | null = null;

  async getApprovedCountsByRarity(): Promise<Record<Rarity, number>> {
    const now = Date.now();
    if (this.memo && now - this.memo.fetchedAt < MEMO_TTL_MS) {
      return this.memo.counts;
    }

    const rows = await this.dataSource.query<Array<{ rarity: Rarity; count: number }>>(
      `SELECT rarity, COUNT(*)::int AS count FROM cards WHERE status = 'approved' GROUP BY rarity`,
    );

    // Every rarity defaults to 0 so one with no approved cards yet — not an
    // error, just an early/incomplete pool — reports 0, never `undefined`.
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    for (const row of rows) {
      counts[row.rarity] = row.count;
    }

    this.memo = { counts, fetchedAt: now };
    return counts;
  }

  /** Forces the next `getApprovedCountsByRarity()` call to re-query instead of serving the memo. */
  invalidate(): void {
    this.memo = null;
  }
}
