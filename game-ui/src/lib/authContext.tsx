import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PlayerDto, PlayerRole } from '@card-game/shared-types';

import { getAuthMe, login as apiLogin, register as apiRegister } from './api';
import { clearToken, decodeClaims, getToken, onLogout, setToken } from './auth';
import { createDataCacheKey, DATA_CACHE_RESOURCES, getCachedData, loadCachedData } from './dataCache';

export interface AuthApi {
  player: PlayerDto | null;
  /**
   * Decoded straight from the stored token — a UI affordance only (see
   * `decodeClaims`'s docstring). Never used server-side, and never should be
   * treated as proof of anything on its own.
   */
  role: PlayerRole | null;
  /** True while the initial session restore (from a stored token) is in flight. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Mirrors `useToast`'s fallback: a component rendered outside a provider
 * (e.g. in isolation in a test) sees a logged-out session rather than
 * crashing. `login`/`register` still reject, since calling them with no
 * provider to receive the result is a real bug, not something to swallow.
 */
const NOOP_AUTH_API: AuthApi = {
  player: null,
  role: null,
  loading: false,
  login: async () => {
    throw new Error('useAuth called outside an AuthProvider');
  },
  register: async () => {
    throw new Error('useAuth called outside an AuthProvider');
  },
  logout: () => {},
};

function roleFromStoredToken(): PlayerRole | null {
  const token = getToken();
  return token ? (decodeClaims(token)?.role ?? null) : null;
}

/**
 * Owns the session: restores it from a stored token on mount, exposes
 * login/register/logout, and reacts to the `auth:logout` event that
 * `request()` (in `./api`) fires on any 401 — that reaction only ever clears
 * local state, never issues another request, which is what stops a 401 from
 * turning into a retry loop.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const storedToken = getToken();
  const authCacheKey = storedToken
    ? createDataCacheKey(storedToken, DATA_CACHE_RESOURCES.authMe)
    : null;
  const cachedPlayer = authCacheKey ? getCachedData<PlayerDto>(authCacheKey) : undefined;
  const [player, setPlayer] = useState<PlayerDto | null>(() => cachedPlayer ?? null);
  const [role, setRole] = useState<PlayerRole | null>(() => roleFromStoredToken());
  const [loading, setLoading] = useState(() => Boolean(storedToken) && cachedPlayer === undefined);

  const logout = useCallback(() => {
    clearToken();
    setPlayer(null);
    setRole(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const cacheKey = createDataCacheKey(token, DATA_CACHE_RESOURCES.authMe);
    const isCurrentSession = () => getToken() === token;
    const cached = getCachedData<PlayerDto>(cacheKey);
    if (cached) {
      setPlayer(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadCachedData(cacheKey, getAuthMe)
      .then((res) => {
        if (cancelled || !isCurrentSession()) return;
        setPlayer(res);
      })
      .catch(() => {
        // A 401 here already cleared the token and fired `auth:logout` (see
        // request()); the listener below handles clearing `role`/`player`.
        // Any other failure (network drop) just leaves the session
        // unrestored for this load — no retry loop either way.
      })
      .finally(() => {
        if (!cancelled && isCurrentSession()) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onLogout(logout), [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setToken(res.token);
    setPlayer(res.player);
    setRole(decodeClaims(res.token)?.role ?? null);
  }, []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const res = await apiRegister({ displayName, email, password });
    setToken(res.token);
    setPlayer(res.player);
    setRole(decodeClaims(res.token)?.role ?? null);
  }, []);

  const api = useMemo<AuthApi>(
    () => ({ player, role, loading, login, register, logout }),
    [player, role, loading, login, register, logout],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  return ctx ?? NOOP_AUTH_API;
}
