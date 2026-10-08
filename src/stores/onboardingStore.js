import { create } from 'zustand';

/**
 * The onboarding draft.
 *
 * Onboarding is multi-step and a half-finished answer should survive a back
 * button, so the draft lives here rather than in component state. It is thrown
 * away once the service has created the profile or organization — this store
 * owns a form, not career data.
 */
const CANDIDATE_DRAFT = {
  name: '',
  location: '',
  careerInterests: [],
  yearsExperience: '',
  headline: '',
  summary: '',
  skills: [],
  education: '',
  institution: '',
  graduationYear: '',
  openTo: [],
  workTypes: [],
  salaryMin: '',
  salaryMax: '',
  currency: 'NGN',
  careerGoal: '',
  industries: [],
};

const EMPLOYER_DRAFT = {
  name: '',
  role: 'owner',
  title: '',
  companyName: '',
  industry: '',
  size: '',
  location: '',
  website: '',
  description: '',
  tagline: '',
  logoColor: '#6c8cff',
  districtId: 'corporate-district',
};

export const useOnboardingStore = create((set, get) => ({
  step: 0,
  candidate: { ...CANDIDATE_DRAFT },
  employer: { ...EMPLOYER_DRAFT },

  setStep: (step) => set({ step }),
  next: () => set((state) => ({ step: state.step + 1 })),
  back: () => set((state) => ({ step: Math.max(0, state.step - 1) })),

  updateCandidate: (patch) => set((state) => ({ candidate: { ...state.candidate, ...patch } })),
  updateEmployer: (patch) => set((state) => ({ employer: { ...state.employer, ...patch } })),

  /** Toggle one value inside a multi-select answer. */
  toggleCandidateValue: (field, value) =>
    set((state) => {
      const current = state.candidate[field] ?? [];
      return {
        candidate: {
          ...state.candidate,
          [field]: current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value],
        },
      };
    }),

  reset: () => set({ step: 0, candidate: { ...CANDIDATE_DRAFT }, employer: { ...EMPLOYER_DRAFT } }),

  /** Prefill the name from the account so onboarding does not ask twice. */
  seedFrom: (user) => {
    if (!user?.displayName) return;
    const { candidate, employer } = get();
    set({
      candidate: { ...candidate, name: candidate.name || user.displayName },
      employer: { ...employer, name: employer.name || user.displayName },
    });
  },
}));
