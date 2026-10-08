import { useAuthStore, selectNeedsRole, selectNeedsOnboarding, selectHomeRoute } from '../stores/authStore.js';

/**
 * Where the signed-in user belongs right now.
 *
 * Identity has three gates — no role yet, role but no profile or company, ready
 * — and every redirect in the app reads the answer from here rather than
 * re-deriving it. Getting this wrong is what strands someone halfway through
 * onboarding with no way forward.
 */
export function useIdentityRoute() {
  const needsRole = useAuthStore(selectNeedsRole);
  const needsOnboarding = useAuthStore(selectNeedsOnboarding);
  const home = useAuthStore(selectHomeRoute);

  if (needsRole) return '/welcome';
  if (needsOnboarding === 'candidate') return '/onboarding/candidate';
  if (needsOnboarding === 'employer') return '/onboarding/employer';
  return home;
}
