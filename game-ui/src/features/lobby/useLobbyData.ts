import { useCallback, useEffect, useState } from 'react';
import type { CaseDto, PlayerDto } from '@card-game/shared-types';

import { claimDailyBonus, getCases, getMe } from '@/lib/api';
import { ApiClientError, isApiErrorCode, USER_MESSAGES } from '@/lib/apiError';
import { getToken } from '@/lib/auth';
import {
  createDataCacheKey,
  DATA_CACHE_RESOURCES,
  getCachedData,
  invalidateCachedData,
  invalidateCachedResources,
  loadCachedData,
} from '@/lib/dataCache';

export interface LobbyData {
  player: PlayerDto | null;
  cases: CaseDto[];
  loading: boolean;
  error: string | null;
  /** Re-runs both GETs — wired to the error banner's retry button. */
  refresh: () => void;
  claimBonus: () => Promise<void>;
  bonusError: string | null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError && isApiErrorCode(err.code)) return USER_MESSAGES[err.code];
  return 'Something went wrong.';
}

/**
 * Owns the lobby's two GET requests plus the daily-bonus mutation, kept out
 * of Lobby.tsx so the screen stays presentational and this hook is testable
 * on its own (renderHook, no DOM needed).
 */
export function useLobbyData(): LobbyData {
  const scope = getToken();
  const playerCacheKey = createDataCacheKey(scope, DATA_CACHE_RESOURCES.player);
  const casesCacheKey = createDataCacheKey(scope, DATA_CACHE_RESOURCES.cases);
  const cachedPlayer = getCachedData<PlayerDto>(playerCacheKey);
  const cachedCases = getCachedData<CaseDto[]>(casesCacheKey);
  const hasCachedData = cachedPlayer !== undefined && cachedCases !== undefined;
  const [player, setPlayer] = useState<PlayerDto | null>(() => cachedPlayer ?? null);
  const [cases, setCases] = useState<CaseDto[]>(() => cachedCases ?? []);
  const [loading, setLoading] = useState(() => !hasCachedData);
  const [error, setError] = useState<string | null>(null);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const force = reloadToken > 0;
    const cachedPlayer = force ? undefined : getCachedData<PlayerDto>(playerCacheKey);
    const cachedCases = force ? undefined : getCachedData<CaseDto[]>(casesCacheKey);

    if (cachedPlayer !== undefined && cachedCases !== undefined) {
      setPlayer(cachedPlayer);
      setCases(cachedCases);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      loadCachedData(playerCacheKey, getMe, { force }),
      loadCachedData(casesCacheKey, getCases, { force }),
    ])
      .then(([playerRes, casesRes]) => {
        if (cancelled) return;
        setPlayer(playerRes);
        setCases(casesRes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [casesCacheKey.id, playerCacheKey.id, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const claimBonus = useCallback(async () => {
    setBonusError(null);
    try {
      const res = await claimDailyBonus();
      // The response already carries the authoritative post-claim balance —
      // folding it straight into `player` is what lets AnimatedNumber tween
      // the win without a full refetch round-trip.
      setPlayer((prev) =>
        prev ? { ...prev, balance: res.balance, dailyBonusAvailableAt: res.nextAvailableAt } : prev,
      );
      // The mounted screen already has the authoritative response above;
      // invalidate its pre-claim snapshot so a later route remount reloads.
      invalidateCachedData(playerCacheKey, casesCacheKey);
      invalidateCachedResources(scope, [DATA_CACHE_RESOURCES.authMe]);
    } catch (err) {
      // On DAILY_BONUS_NOT_READY (or any other failure) the balance is left
      // untouched — only the error surfaces, per the spec.
      setBonusError(errorMessage(err));
    }
  }, [casesCacheKey.id, playerCacheKey.id]);

  return { player, cases, loading, error, refresh, claimBonus, bonusError };
}
