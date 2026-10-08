import { useEffect, useState } from 'react';
import { EmployerShell, EmployerPage } from '../components/employer/EmployerShell.jsx';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  Field,
  TextInput,
  TextArea,
  Select,
  CompanyMark,
  StatTile,
  StatGrid,
  LoadingState,
  ErrorState,
  EmptyState,
  IconGrid,
} from '../components/ui/index.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { useUiStore } from '../stores/uiStore.js';
import { useAsync } from '../hooks/useAsync.js';
import * as socialService from '../services/socialService.js';
import { INDUSTRIES, COMPANY_SIZES } from '../utils/organizationOptions.js';
import { formatNumber, formatRelativeTime } from '../utils/format.js';

/**
 * The company profile.
 *
 * It is both the employer's settings page and their public presence: the same
 * record candidates see when they walk into a district, follow the company or
 * read one of its posts.
 */
export default function EmployerCompany() {
  const status = useEmployerStore((s) => s.status);
  const error = useEmployerStore((s) => s.error);
  const organization = useEmployerStore((s) => s.organization);
  const jobs = useEmployerStore((s) => s.jobs);
  const load = useEmployerStore((s) => s.load);
  const updateCompany = useEmployerStore((s) => s.updateCompany);
  const pushToast = useUiStore((s) => s.pushToast);

  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const postsQuery = useAsync(
    () => (organization ? socialService.listOrganizationPosts(organization.id) : Promise.resolve([])),
    [organization?.id],
  );

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const startEditing = () =>
    setDraft({
      name: organization.name,
      tagline: organization.tagline,
      description: organization.description,
      industry: organization.industry,
      size: organization.size,
      location: organization.location,
      website: organization.website ?? '',
    });

  const save = async () => {
    setSaving(true);
    try {
      await updateCompany(draft);
      setDraft(null);
      pushToast({ title: 'Company profile updated', tone: 'success' });
    } catch (caught) {
      pushToast({ title: 'Could not save', body: caught.message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EmployerShell>
      <EmployerPage
        title="Company profile"
        lede="What candidates see before they apply, and what they follow when they want to hear about your roles."
      >
        {status === 'loading' ? <LoadingState rows={3} label="Loading your company" /> : null}
        {status === 'error' ? <ErrorState error={{ message: error }} onRetry={load} /> : null}

        {status === 'ready' && !organization ? (
          <EmptyState title="No company on this account" icon={<IconGrid size={22} />} />
        ) : null}

        {status === 'ready' && organization ? (
          <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
            <Panel>
              <PanelHeader
                title="Profile"
                action={draft ? null : <Button size="sm" variant="ghost" onClick={startEditing}>Edit</Button>}
              />

              {draft ? (
                <div className="g-stack">
                  <Field label="Company name" htmlFor="c-name">
                    <TextInput id="c-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </Field>
                  <Field label="Tagline" htmlFor="c-tagline">
                    <TextInput id="c-tagline" value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
                  </Field>
                  <Field label="Description" htmlFor="c-desc">
                    <TextArea id="c-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                  </Field>
                  <div className="job-form__row">
                    <Field label="Industry" htmlFor="c-industry">
                      <Select id="c-industry" value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })}>
                        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                      </Select>
                    </Field>
                    <Field label="Company size" htmlFor="c-size">
                      <Select id="c-size" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })}>
                        {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="job-form__row">
                    <Field label="Location" htmlFor="c-location">
                      <TextInput id="c-location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                    </Field>
                    <Field label="Website" htmlFor="c-website">
                      <TextInput id="c-website" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
                    </Field>
                  </div>
                  <div className="g-row" style={{ justifyContent: 'flex-end' }}>
                    <Button variant="subtle" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
                    <Button variant="primary" onClick={save} loading={saving}>Save profile</Button>
                  </div>
                </div>
              ) : (
                <div className="g-stack">
                  <div className="employer__company-head">
                    <CompanyMark name={organization.name} color={organization.logoColor} size="lg" />
                    <div>
                      <h2 style={{ fontSize: 'var(--g-text-md)' }}>{organization.name}</h2>
                      <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>{organization.tagline}</p>
                    </div>
                  </div>
                  <p className="g-muted" style={{ lineHeight: 1.7 }}>{organization.description}</p>
                  <div className="g-row" style={{ flexWrap: 'wrap' }}>
                    <Badge>{organization.industry}</Badge>
                    <Badge>{organization.size} people</Badge>
                    <Badge>{organization.location}</Badge>
                    {organization.website ? <Badge>{organization.website.replace(/^https?:\/\//, '')}</Badge> : null}
                  </div>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Presence" subtitle="How candidates encounter you across Grooveli." />
              <StatGrid>
                <StatTile label="Followers" value={formatNumber(organization.followerCount)} accent="var(--g-accent)" />
                <StatTile label="Open roles" value={jobs.filter((j) => j.status === 'published').length} />
                <StatTile label="Total roles" value={jobs.length} />
                <StatTile label="District" value={organization.districtId.replace(/-/g, ' ')} />
              </StatGrid>
            </Panel>

            <Panel>
              <PanelHeader title="Company posts" subtitle="What you have shared on the Grooveli Network." />
              {postsQuery.isLoading ? <LoadingState rows={1} label="Loading posts" /> : null}
              {!postsQuery.isLoading && (postsQuery.data?.length ?? 0) === 0 ? (
                <EmptyState
                  title="No posts yet"
                  body="Company updates and role announcements appear in the network feed candidates read."
                  icon={<IconGrid size={22} />}
                />
              ) : null}
              {(postsQuery.data ?? []).map((post) => (
                <div key={post.id} className="g-stack" style={{ gap: 6, paddingBottom: 'var(--g-space-3)' }}>
                  <p style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.65 }}>{post.body}</p>
                  <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                    {formatRelativeTime(post.createdAt)} · {post.likeCount} reactions
                  </span>
                </div>
              ))}
            </Panel>
          </div>
        ) : null}
      </EmployerPage>
    </EmployerShell>
  );
}
