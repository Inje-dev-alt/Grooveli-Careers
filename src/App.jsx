import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/base.css';
import './styles/utilities.css';
import './components/shell/shell.css';
import { ModalRoot } from './components/ui/ModalRoot.jsx';
import { ToastStack } from './components/hud/ToastStack.jsx';
import { MenuDrawer } from './components/shell/MenuDrawer.jsx';
import { ErrorBoundary } from './components/shell/ErrorBoundary.jsx';
import { WorldLoader } from './components/game/WorldLoader.jsx';
import { useAuthStore, selectIsAuthenticated, selectIsRestoring } from './stores/authStore.js';
import { useUiStore } from './stores/uiStore.js';
import { useMissionStore } from './stores/missionStore.js';
import { useIsCompact } from './hooks/useMediaQuery.js';

// Routes are split so the first paint is the shell, not the whole product.
const Landing = lazy(() => import('./pages/Landing.jsx'));
const City = lazy(() => import('./pages/City.jsx'));
const Apartment = lazy(() => import('./pages/Apartment.jsx'));
const Jobs = lazy(() => import('./pages/Jobs.jsx'));
const Missions = lazy(() => import('./pages/Missions.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AI = lazy(() => import('./pages/AI.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/**
 * Routes that need a session.
 *
 * While a stored token is being exchanged for a user, the route waits rather
 * than redirecting — otherwise every reload and every deep link would bounce
 * the player back to the entry screen.
 */
function RequireSession({ children }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isRestoring = useAuthStore(selectIsRestoring);
  const location = useLocation();

  if (isRestoring) return <WorldLoader label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return children;
}

/** Cross-cutting concerns that need the router but belong to no single screen. */
function AppEffects() {
  const location = useLocation();
  const setCompact = useUiStore((s) => s.setCompact);
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const loadMissions = useMissionStore((s) => s.loadMissions);
  const missionStatus = useMissionStore((s) => s.status);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isCompact = useIsCompact();

  useEffect(() => setCompact(isCompact), [isCompact, setCompact]);

  // Exchange a stored token for the current user before any route decides
  // whether the player is signed in.
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Missions are loaded once, globally: they drive progression from every
  // screen, not only the missions page.
  useEffect(() => {
    if (missionStatus === 'idle') loadMissions();
  }, [missionStatus, loadMissions]);

  // A route change should never leave a panel from the previous screen open.
  useEffect(() => {
    closeAllModals();
    setMenuOpen(false);
  }, [location.pathname, closeAllModals, setMenuOpen]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppEffects />
        <Suspense fallback={<WorldLoader label="Loading Grooveli" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/city"
              element={
                <RequireSession>
                  <City />
                </RequireSession>
              }
            />
            <Route
              path="/apartment"
              element={
                <RequireSession>
                  <Apartment />
                </RequireSession>
              }
            />
            <Route
              path="/jobs"
              element={
                <RequireSession>
                  <Jobs />
                </RequireSession>
              }
            />
            <Route
              path="/missions"
              element={
                <RequireSession>
                  <Missions />
                </RequireSession>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireSession>
                  <Profile />
                </RequireSession>
              }
            />
            <Route
              path="/ai"
              element={
                <RequireSession>
                  <AI />
                </RequireSession>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        {/* Global layers: every panel, menu and toast in the product renders here. */}
        <ModalRoot />
        <MenuDrawer />
        <ToastStack />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
