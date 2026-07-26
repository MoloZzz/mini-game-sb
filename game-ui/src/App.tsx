import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { CASE_SEEDS } from '@card-game/shared-types';

import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { AdminReview } from '@/features/admin/AdminReview';
import { Inventory } from '@/features/inventory/Inventory';
import { Lobby } from '@/features/lobby/Lobby';
import { OpenCaseScreen } from '@/features/open/OpenCaseScreen';

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
  // The reel is a full-focus screen — the nav strip is hidden while a case is
  // opening so nothing competes with the 5.5 seconds.
  const fullFocus = useLocation().pathname.startsWith('/open/');

  const routes = (
    <Routes>
      <Route path="/" element={<LobbyRoute />} />
      <Route path="/open/:slug" element={<OpenRoute />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/admin" element={<AdminReview />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (fullFocus) return <div className="min-h-screen bg-neutral-950">{routes}</div>;
  return <AppShell>{routes}</AppShell>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
