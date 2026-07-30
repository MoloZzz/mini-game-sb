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
  { to: '/admin/orders', label: 'Orders', requiresRole: 'admin' },
];

/**
 * A slim nav strip only. The lobby carries its own title and balance header,
 * so duplicating them here would put two balances on the same screen.
 */
export function AppShell({
  children,
  showNavigation = true,
}: {
  children: ReactNode;
  showNavigation?: boolean;
}) {
  const { player, role, logout } = useAuth();
  const links = LINKS.filter((link) => !link.requiresRole || link.requiresRole === role);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {showNavigation && (
        <nav className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-neutral-800 bg-neutral-950/90 px-3 py-2 backdrop-blur sm:flex-nowrap sm:px-4">
          <div className="order-2 flex w-full min-w-0 items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:order-1 sm:w-auto sm:flex-1 sm:pb-0">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `shrink-0 rounded-md px-3 py-3 text-sm transition-colors sm:py-1.5 ${
                    isActive
                      ? 'bg-amber-400/10 text-amber-300'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
          <span className="hidden text-xs text-neutral-600 sm:order-2 sm:ml-auto sm:block">
            {import.meta.env.VITE_USE_MOCKS === '1' ? 'mock data' : 'live api'}
          </span>
          {player && (
            <div className="order-1 ml-auto flex min-w-0 items-center gap-2 sm:order-3 sm:ml-4 sm:border-l sm:border-neutral-800 sm:pl-4">
              <span className="max-w-32 truncate text-xs text-neutral-400">{player.displayName}</span>
              <button
                type="button"
                onClick={logout}
                className="shrink-0 rounded-md px-2 py-3 text-xs text-neutral-400 transition-colors hover:text-neutral-200 sm:py-1"
              >
                Log out
              </button>
            </div>
          )}
        </nav>
      )}
      {children}
    </div>
  );
}
