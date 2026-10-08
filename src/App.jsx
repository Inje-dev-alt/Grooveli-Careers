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
import {
  useAuthStore,
  selectIsAuthenticated,
  selectIsRestoring,
  selectNeedsRole,
  selectNeedsOnboarding,
} from './stores/authStore.js';
import { useUiStore } from './stores/uiStore.js';
import { useCareerStore } from './stores/careerStore.js';
import { useMissionStore } from './stores/missionStore.js';
import { useIdentityRoute } from './hooks/useIdentityRoute.js';
import { useIsCompact } from './hooks/useMediaQuery.js';

// Routes are split so the first paint is the shell, not the whole product.
const SignIn = lazy(() => import('./pages/SignIn.jsx'));
const SignUp = lazy(() => import('./pages/SignUp.jsx'));
const RoleSelect = lazy(() => import('./pages/RoleSelect.jsx'));
const CandidateOnboarding = lazy(() => import('./pages/CandidateOnboarding.jsx'));
const EmployerOnboarding = lazy(() => import('./pages/EmployerOnboarding.jsx'));

const City = lazy(() => import('./pages/City.jsx'));
const Apartment = lazy(() => import('./pages/Apartment.jsx'));
const Jobs = lazy(() => import('./pages/Jobs.jsx'));
const Missions = lazy(() => import('./pages/Missions.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AI = lazy(() => import('./pages/AI.jsx'));
const Network = lazy(() => import('./pages/Network.jsx'));

const EmployerDashboard = lazy(() => import('./pages/EmployerDashboard.jsx'));
const EmployerJobs = lazy(() => import('./pages/EmployerJobs.jsx'));
const EmployerCandidates = lazy(() => import('./pages/EmployerCandidates.jsx'));
const EmployerCompany = lazy(() => import('./pages/EmployerCompany.jsx'));

const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/**
 * Identity has three gates: no session, no role, and a role whose setup is
 * unfinished. Every guarded route checks the same three, in the same order, so
 * nobody can land somewhere the account is not ready for.
 */
function RequireIdentity({ role, children }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isRestoring = useAuthStore(selectIsRestoring);
  const needsRole = useAuthStore(selectNeedsRole);
  const needsOnboarding = useAuthStore(selectNeedsOnboarding);
  const activeRole = useAuthStore((s) => s.user?.activeRole);
  const identityRoute = useIdentityRoute();
  const location = useLocation();

  if (isRestoring) return <WorldLoader label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (needsRole) return <Navigate to="/welcome" replace />;
  if (needsOnboarding) return <Navigate to={identityRoute} replace />;

  // A candidate who lands on an employer route (or the reverse) is sent to
  // their own space rather than shown an experience that cannot work for them.
  if (role && activeRole !== role) return <Navigate to={identityRoute} replace />;

  return children;
}

/** Routes that only make sense while signed in but before setup is finished. */
function RequireSession({ children }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isRestoring = useAuthStore(selectIsRestoring);

  if (isRestoring) return <WorldLoader label="Restoring your session" />;
  if (!isAuthenticated) return <Navigate to="/signin" replace />;
  return children;
}

/** Sends `/` wherever this particular account belongs. */
function IdentityRedirect() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isRestoring = useAuthStore(selectIsRestoring);
  const identityRoute = useIdentityRoute();

  if (isRestoring) return <WorldLoader label="Restoring your session" />;
  return <Navigate to={isAuthenticated ? identityRoute : '/signin'} replace />;
}

/** Cross-cutting concerns that need the router but belong to no single screen. */
function AppEffects() {
  const location = useLocation();
  const setCompact = useUiStore((s) => s.setCompact);
  const closeAllModals = useUiStore((s) => s.closeAllModals);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const user = useAuthStore((s) => s.user);
  const activeRole = useAuthStore((s) => s.user?.activeRole);
  const hydrateCareer = useCareerStore((s) => s.hydrate);
  const careerHydrated = useCareerStore((s) => s.hydrated);
  const loadMissions = useMissionStore((s) => s.loadMissions);
  const missionStatus = useMissionStore((s) => s.status);
  const isCompact = useIsCompact();

  useEffect(() => setCompact(isCompact), [isCompact, setCompact]);

  // Exchange a stored token for the current user before any route decides
  // whether this person is signed in.
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Career progression and missions belong to the candidate experience, and
  // are loaded once the account is known to be a candidate — an employer has
  // neither, and loading them would be meaningless.
  useEffect(() => {
    if (!user || activeRole !== 'candidate') return;
    if (!careerHydrated) hydrateCareer();
    if (missionStatus === 'idle') loadMissions();
  }, [user, activeRole, careerHydrated, hydrateCareer, missionStatus, loadMissions]);

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
            <Route path="/" element={<IdentityRedirect />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            <Route path="/welcome" element={<RequireSession><RoleSelect /></RequireSession>} />
            <Route
              path="/onboarding/candidate"
              element={<RequireSession><CandidateOnboarding /></RequireSession>}
            />
            <Route
              path="/onboarding/employer"
              element={<RequireSession><EmployerOnboarding /></RequireSession>}
            />

            {/* Candidate experience */}
            <Route path="/city" element={<RequireIdentity role="candidate"><City /></RequireIdentity>} />
            <Route path="/apartment" element={<RequireIdentity role="candidate"><Apartment /></RequireIdentity>} />
            <Route path="/jobs" element={<RequireIdentity role="candidate"><Jobs /></RequireIdentity>} />
            <Route path="/missions" element={<RequireIdentity role="candidate"><Missions /></RequireIdentity>} />
            <Route path="/ai" element={<RequireIdentity role="candidate"><AI /></RequireIdentity>} />
            <Route path="/network" element={<RequireIdentity role="candidate"><Network /></RequireIdentity>} />
            <Route path="/profile" element={<RequireIdentity role="candidate"><Profile /></RequireIdentity>} />

            {/* Employer experience */}
            <Route path="/employer" element={<RequireIdentity role="employer"><EmployerDashboard /></RequireIdentity>} />
            <Route path="/employer/jobs" element={<RequireIdentity role="employer"><EmployerJobs /></RequireIdentity>} />
            <Route path="/employer/candidates" element={<RequireIdentity role="employer"><EmployerCandidates /></RequireIdentity>} />
            <Route path="/employer/company" element={<RequireIdentity role="employer"><EmployerCompany /></RequireIdentity>} />

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
