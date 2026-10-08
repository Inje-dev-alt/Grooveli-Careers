import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { JobBrowser } from '../components/jobs/JobBrowser.jsx';
import { Button } from '../components/ui/index.js';
import { useUiStore } from '../stores/uiStore.js';
import { useJobStore } from '../stores/jobStore.js';

/**
 * The job marketplace as a standalone route.
 *
 * The marketplace has to work without the game: the city is one way to discover
 * the same opportunities, not the only way.
 */
export default function Jobs() {
  const [params] = useSearchParams();
  const openModal = useUiStore((s) => s.openModal);
  const setQuery = useJobStore((s) => s.setQuery);

  // Career discovery and the AI link here with a search already in mind.
  const search = params.get('search');
  useEffect(() => {
    if (search) setQuery({ search });
  }, [search, setQuery]);

  return (
    <AppShell>
      <Page
        title="Job Marketplace"
        lede="Every role open across Grooveli City, scored against your profile. Applications above 60% match count toward your career level."
        action={
          <Button variant="ghost" onClick={() => openModal('ai', { initialIntent: 'find-jobs' })}>
            Ask Grooveli AI
          </Button>
        }
      >
        <JobBrowser wide onOpenJob={(job) => openModal('job-detail', { job })} />
      </Page>
    </AppShell>
  );
}
