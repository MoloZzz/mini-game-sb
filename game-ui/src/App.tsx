import { lazy, Suspense, useState, type ReactNode } from 'react';
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
import { Login } from '@/features/auth/Login';
import { Register } from '@/features/auth/Register';
import type { SessionExpedition } from '@/features/expeditions/sessionExpedition';
import { Lobby } from '@/features/lobby/Lobby';
import { AuthProvider, useAuth } from '@/lib/authContext';

// These screens are not needed for the initial sign-in/lobby path. Keeping
// their feature code in route chunks avoids parsing the admin tooling, reel
// animation and secondary collections before a player asks for them.
const AdminReview = lazy(async () => ({
  default: (await import('@/features/admin/AdminReview')).AdminReview,
}));
const GenerationOrders = lazy(async () => ({
  default: (await import('@/features/admin/GenerationOrders')).GenerationOrders,
}));
const CollectionPage = lazy(async () => ({
  default: (await import('@/features/collection/CollectionPage')).CollectionPage,
}));
const ArchiveNotesPage = lazy(async () => ({
  default: (await import('@/features/archive/ArchiveNotesPage')).ArchiveNotesPage,
}));
const OpenArchivePassScreen = lazy(async () => ({
  default: (await import('@/features/archive/OpenArchivePassScreen')).OpenArchivePassScreen,
}));
const Inventory = lazy(async () => ({
  default: (await import('@/features/inventory/Inventory')).Inventory,
}));
const OpenCaseScreen = lazy(async () => ({
  default: (await import('@/features/open/OpenCaseScreen')).OpenCaseScreen,
}));

function RouteLoading() {
  return <div className="min-h-screen bg-neutral-950" aria-busy="true" aria-label="Loading screen" />;
}

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
      onOpenArchive={() => navigate('/archive')}
    />
  );
}

function ArchivePassRoute() {
  const { passId } = useParams<{ passId: string }>();
  const navigate = useNavigate();
  if (!passId) return <Navigate to="/archive" replace />;
  return <OpenArchivePassScreen passId={passId} onBackToArchive={() => navigate('/archive')} onToInventory={() => navigate('/inventory')} />;
}

function ArchiveRoute() {
  const navigate = useNavigate();
  return <ArchiveNotesPage onOpenPass={(passId) => navigate(`/archive/passes/${passId}/open`)} />;
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
  const fullFocus = pathname.startsWith('/open/') || pathname.startsWith('/archive/passes/') || pathname === '/login' || pathname === '/register';

  const routes = (
    <Suspense fallback={<RouteLoading />}>
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
          path="/archive"
          element={
            <RequireAuth>
              <ArchiveRoute />
            </RequireAuth>
          }
        />
        <Route
          path="/archive/passes/:passId/open"
          element={
            <RequireAuth>
              <ArchivePassRoute />
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
        <Route
          path="/admin/orders"
          element={
            <RequireAuth role="admin">
              <GenerationOrders />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );

  // Keep the routing subtree mounted while crossing the full-focus boundary.
  // Switching wrapper element types here previously remounted Routes in
  // addition to the ordinary route transition.
  return <AppShell showNavigation={!fullFocus}>{routes}</AppShell>;
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
