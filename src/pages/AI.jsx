import { AppShell, Page } from '../components/shell/AppShell.jsx';
import { AICareerCenter } from '../components/ai/AICareerCenter.jsx';
import { Panel } from '../components/ui/index.js';

export default function AI() {
  return (
    <AppShell>
      <Page
        title="AI Career Center"
        lede="Grooveli AI knows your profile, your applications and every role open in the city. It is a career agent, not a chatbot."
      >
        <Panel pad="md" style={{ minHeight: '60vh', display: 'flex' }}>
          <AICareerCenter />
        </Panel>
      </Page>
    </AppShell>
  );
}
