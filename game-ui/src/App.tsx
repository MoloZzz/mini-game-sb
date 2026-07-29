import type { ReactNode } from 'react';
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

function LobbyRoute() {
  const navigate = useNavigate();
  return <Lobby onOpenCase={(slug) => navigate(`/open/${slug}`)} />;
}

function OpenRoute() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  if (!slug) return <Navigate to="/" replace />;

  // Falls back to the seed name so the header reads properly before (or
  // without) a /cases round trip.
  const caseName = CASE_SEEDS.find((c) => c.slug === slug)?.name;

  return (
    <OpenCaseScreen
      slug={slug}
      caseName={caseName}
      onBackToLobby={() => navigate('/')}
      onToInventory={() => navigate('/inventory')}
    />
  );
}

export function AppRoutes() {
  const pathname = useLocation().pathname;
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
            <LobbyRoute />
          </RequireAuth>
        }
      />
      <Route
        path="/open/:slug"
        element={
          <RequireAuth>
            <OpenRoute />
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
