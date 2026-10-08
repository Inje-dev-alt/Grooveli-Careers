import { useState } from 'react';
import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { AICareerCenter } from '../components/ai/AICareerCenter.jsx';
import { CareerDiscovery } from '../components/ai/CareerDiscovery.jsx';
import { NextCareerAction } from '../components/ai/NextCareerAction.jsx';
import { Panel, Tabs } from '../components/ui/index.js';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'companion', label: 'Career companion' },
  { id: 'discovery', label: 'Career discovery' },
];

/**
 * The AI Career Center.
 *
 * Three things, in the order they matter: what to do next, what the agent can
 * work on with you, and where your skills could take you.
 */
export default function AI() {
  const [tab, setTab] = useState('companion');
  const navigate = useNavigate();

  return (
    <AppShell>
      <Page
        title="AI Career Center"
        lede="Grooveli AI knows your profile, your applications and every role open in the city. It is a career agent, not a chatbot."
      >
        <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
          <NextCareerAction />

          <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="AI sections" />

          {tab === 'companion' ? (
            <Panel pad="md" style={{ minHeight: '56vh', display: 'flex' }}>
              <AICareerCenter />
            </Panel>
          ) : (
            <CareerDiscovery
              onExplore={(match) => navigate(`/jobs?search=${encodeURIComponent(match.title)}`)}
            />
          )}
        </div>
      </Page>
    </AppShell>
  );
}
