import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/lib/authContext';

interface NavItem {
  to: string;
  label: string;
  /** Omitted entirely (not just disabled) unless the signed-in role matches. */
  requiresRole?: 'admin';
}

const LINKS: ReadonlyArray<NavItem> = [
  { to: '/', label: 'Play' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/collection', label: 'Collection' },
  { to: '/archive', label: 'Tasks' },
  { to: '/admin', label: 'Review', requiresRole: 'admin' },
];

/**
 * A slim nav strip only. The lobby carries its own title and balance header,
 * so duplicating them here would put two balances on the same screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { player, role, logout } = useAuth();
  const links = LINKS.filter((link) => !link.requiresRole || link.requiresRole === role);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="sticky top-0 z-40 flex items-center gap-1 border-b border-neutral-800 bg-neutral-950/90 px-4 py-2 backdrop-blur">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-amber-400/10 text-amber-300'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        <span className="ml-auto text-xs text-neutral-600">
          {import.meta.env.VITE_USE_MOCKS === '1' ? 'mock data' : 'live api'}
        </span>
        {player && (
          <div className="ml-4 flex items-center gap-2 border-l border-neutral-800 pl-4">
            <span className="text-xs text-neutral-400">{player.displayName}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
            >
              Log out
            </button>
          </div>
        )}
      </nav>
      {children}
    </div>
  );
}
