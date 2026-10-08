import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { CareerProfile } from '../components/profile/CareerProfile.jsx';
import { Button } from '../components/ui/index.js';
import { useUiStore } from '../stores/uiStore.js';

export default function Profile() {
  const openModal = useUiStore((s) => s.openModal);

  return (
    <AppShell>
      <Page
        title="Career Profile"
        lede="Your professional identity in Grooveli — skills, evidence and everything in flight. Employers see an appropriate professional version of this."
        action={
          <div className="g-row">
            <Button variant="ghost" onClick={() => openModal('achievements')}>
              Achievements
            </Button>
            <Button variant="ghost" onClick={() => openModal('career-stats')}>
              Statistics
            </Button>
          </div>
        }
      >
        <CareerProfile />
      </Page>
    </AppShell>
  );
}
