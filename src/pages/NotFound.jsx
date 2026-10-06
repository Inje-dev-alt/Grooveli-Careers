import { useNavigate } from 'react-router-dom';
import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { EmptyState, Button, IconMap } from '../components/ui/index.js';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <Page title="Nothing here">
        <EmptyState
          title="That address is not part of Grooveli City"
          body="The districts are all reachable from the city map."
          icon={<IconMap size={22} />}
          action={
            <Button variant="primary" onClick={() => navigate('/city')}>
              Back to the city
            </Button>
          }
        />
      </Page>
    </AppShell>
  );
}
