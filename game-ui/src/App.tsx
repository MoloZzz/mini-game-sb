import { useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { CASE_SEEDS, type PlayerRole } from '@card-game/shared-types';

import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { AdminReview } from '@/features/admin/AdminReview';
import { Login } from '@/features/auth/Login';
import { Register } from '@/features/auth/Register';
import { CollectionPage } from '@/features/collection/CollectionPage';
import type { SessionExpedition } from '@/features/expeditions/sessionExpedition';
import { Inventory } from '@/features/inventory/Inventory';
import { Lobby } from '@/features/lobby/Lobby';
import { OpenCaseScreen } from '@/features/open/OpenCaseScreen';
import { AuthProvider, useAuth } from '@/lib/authContext';

/**
 * Gates a route behind an active session and, optionally, a specific role.
 * An unauthenticated hit bounces to /login with the attempted location
 * stashed in router state, so Login can send the player back afterwards.
 * A logged-in player who fails the role check (e.g. non-admin on /admin)
 * bounces to the lobby instead — they have a valid session, just not this
 * permission.
 */
function RequireAuth({ children, role }: { children: ReactNode; role?: PlayerRole }) {
  const { player, role: userRole, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!player) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && userRole !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

interface ExpeditionRouteState {
  expedition?: SessionExpedition;
}

function LobbyRoute({
  completedExpedition,
  onStartExpedition,
}: {
  completedExpedition: SessionExpedition | null;
  onStartExpedition: (expedition: SessionExpedition) => void;
}) {
  const navigate = useNavigate();
  return (
    <Lobby
      onOpenCase={(slug) => navigate(`/open/${slug}`)}
      completedExpedition={completedExpedition}
      onStartExpedition={(expedition) => {
        onStartExpedition(expedition);
        navigate(`/open/${expedition.caseSlug}`, { state: { expedition } satisfies ExpeditionRouteState });
      }}
    />
  );
}

function OpenRoute({
  activeExpedition,
  onExpeditionComplete,
}: {
  activeExpedition: SessionExpedition | null;
  onExpeditionComplete: (expedition: SessionExpedition) => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  if (!slug) return <Navigate to="/" replace />;

  // Falls back to the seed name so the header reads properly before (or
  // without) a /cases round trip.
  const caseName = CASE_SEEDS.find((c) => c.slug === slug)?.name;
  const routeExpedition = (location.state as ExpeditionRouteState | null)?.expedition;
  const expedition =
    routeExpedition &&
    activeExpedition?.kind === routeExpedition.kind &&
    activeExpedition.caseSlug === slug
      ? activeExpedition
      : null;

  return (
    <OpenCaseScreen
      slug={slug}
      caseName={caseName}
      onBackToLobby={() => navigate('/')}
      onToInventory={() => navigate('/inventory')}
      expedition={expedition}
      onExpeditionComplete={() => expedition && onExpeditionComplete(expedition)}
      onToExpeditionCollection={() => navigate('/collection')}
    />
  );
}

export function AppRoutes() {
  const pathname = useLocation().pathname;
  const [activeExpedition, setActiveExpedition] = useState<SessionExpedition | null>(null);
  const [completedExpedition, setCompletedExpedition] = useState<SessionExpedition | null>(null);
  // The reel is a full-focus screen — the nav strip is hidden while a case is
  // opening so nothing competes with the 5.5 seconds. /login and /register
  // hide it too: its links all point at protected routes a signed-out
  // visitor can't use yet.
  const fullFocus = pathname.startsWith('/open/') || pathname === '/login' || pathname === '/register';

  const routes = (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <LobbyRoute
              completedExpedition={completedExpedition}
              onStartExpedition={(expedition) => {
                setActiveExpedition(expedition);
                setCompletedExpedition(null);
              }}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/open/:slug"
        element={
          <RequireAuth>
            <OpenRoute
              activeExpedition={activeExpedition}
              onExpeditionComplete={setCompletedExpedition}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/inventory"
        element={
          <RequireAuth>
            <Inventory />
          </RequireAuth>
        }
      />
      <Route
        path="/collection"
        element={
          <RequireAuth>
            <CollectionPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminReview />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (fullFocus) return <div className="min-h-screen bg-neutral-950">{routes}</div>;
  return <AppShell>{routes}</AppShell>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
