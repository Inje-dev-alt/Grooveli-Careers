import { useAuthStore } from '../stores/authStore.js';
import { getCareerPath } from '../data/careerPaths.js';
import { signedInCareerPathId } from '../services/candidateService.js';

/**
 * The signed-in candidate's home path, or null.
 *
 * Null for employer accounts and before candidate onboarding completes - the
 * HUD and location panels branch on this, so it reads synchronously from the
 * mock db. Subscribing to the account is also what makes the hook refresh the
 * moment onboarding finishes or the account changes.
 *
 * @returns {import('../data/careerPaths.js').CareerPath | null}
 */
export function useCareerPath() {
  const account = useAuthStore((s) => s.user);

  // Employers are not on a path, even a dual-role account acting as one.
  if (!account?.candidateProfileId || account.activeRole === 'employer') return null;

  return getCareerPath(signedInCareerPathId());
}