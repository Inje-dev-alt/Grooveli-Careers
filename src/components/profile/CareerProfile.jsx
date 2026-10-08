import { useEffect, useRef, useState } from 'react';
import './profile.css';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  Meter,
  ProgressBar,
  StatTile,
  StatGrid,
  Field,
  TextInput,
  TextArea,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconDoc,
  IconCheck,
  IconBriefcase,
  IconAward,
} from '../ui/index.js';
import { ApplicationList } from './ApplicationList.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useCareerStore, selectProgression, selectCareerTitle } from '../../stores/careerStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import * as candidateService from '../../services/candidateService.js';
import * as careerService from '../../services/careerService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';
import { formatCompactMoney, initials, formatRelativeTime, titleCase } from '../../utils/format.js';

/**
 * The career identity.
 *
 * The PRD frames this as more than a CV, so evidence sits alongside the
 * biography: what is verified, what is still missing, and what the career
 * activity stream can show an employer. Level and reputation are shown as the
 * separate things they are — one is progression, the other credibility.
 */
export function CareerProfile({ compact = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const progression = useCareerStore(selectProgression);
  const careerTitle = useCareerStore(selectCareerTitle);
  const reputation = useCareerStore((s) => s.reputation);
  const pushToast = useUiStore((s) => s.pushToast);

  const profileQuery = useAsync(() => candidateService.getProfile(), []);
  const statsQuery = useAsync(() => careerService.getStats(), []);
  const activityQuery = useAsync(() => careerService.listActivity(6), []);

  const profile = profileQuery.data;

  // Completing the profile is a career event, and it may only count once.
  useEffect(() => {
    if (profile && profile.completeness >= 100) {
      recordCareerEvent(CAREER_EVENTS.PROFILE_COMPLETED, { once: true });
    }
  }, [profile?.completeness]);

  const startEditing = () => {
    setDraft({
      headline: profile.headline,
      summary: profile.summary,
      location: profile.location,
      careerGoal: profile.careerGoal,
      salaryMin: profile.salaryExpectation.min,
      salaryMax: profile.salaryExpectation.max,
    });
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await candidateService.updateProfile({
        headline: draft.headline,
        summary: draft.summary,
        location: draft.location,
        careerGoal: draft.careerGoal,
        salaryExpectation: {
          ...profile.salaryExpectation,
          min: Number(draft.salaryMin) || 0,
          max: Number(draft.salaryMax) || 0,
        },
      });
      profileQuery.setData(updated);
      setEditing(false);
      pushToast({ title: 'Profile updated', tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Could not save', body: error.message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleCvSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      // Nothing is uploaded anywhere — only the file name is recorded while the
      // backend is absent. The file never leaves the browser.
      const updated = await candidateService.uploadCv({ fileName: file.name });
      profileQuery.setData(updated);
      recordCareerEvent(CAREER_EVENTS.CV_UPLOADED, { once: true });
    } catch (error) {
      pushToast({ title: 'Could not attach your CV', body: error.message, tone: 'danger' });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <AsyncBoundary query={profileQuery} loading={<LoadingState rows={4} label="Loading your profile" />}>
      {() => (
        <div className="profile">
          <header className="profile__hero">
            <span className="profile__avatar">{initials(user?.displayName ?? 'Candidate')}</span>
            <div className="profile__identity">
              <h2 className="profile__name">{user?.displayName ?? 'Candidate'}</h2>
              <p className="profile__headline">{profile.headline || 'Add a headline to your profile'}</p>
              <div className="g-row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
                <Badge tone="accent">{careerTitle}</Badge>
                {profile.location ? <Badge>{profile.location}</Badge> : null}
                {profile.yearsExperience > 0 ? <Badge>{profile.yearsExperience} years experience</Badge> : null}
              </div>
            </div>
            <div className="profile__level">
              <span className="g-eyebrow">Career level</span>
              <span className="profile__level-value">{progression.level}</span>
              <ProgressBar
                value={progression.xpIntoLevel}
                max={progression.xpForNextLevel}
                size="sm"
                label="Progress to next career level"
              />
              <span className="g-dim g-mono" style={{ fontSize: 'var(--g-text-xs)' }}>
                {progression.xpIntoLevel} / {progression.xpForNextLevel} XP
              </span>
              <span className="g-row" style={{ gap: 6, marginTop: 4 }}>
                <IconAward size={13} style={{ color: 'var(--g-accent)' }} />
                <span className="g-mono" style={{ fontSize: 'var(--g-text-xs)', color: 'var(--g-accent)' }}>
                  Reputation {reputation}
                </span>
              </span>
            </div>
          </header>

          <div className={`profile__grid${compact ? '' : ' profile__grid--split'}`}>
            <div className="g-stack">
              <Panel>
                <PanelHeader
                  title="About"
                  action={editing ? null : <Button size="sm" variant="ghost" onClick={startEditing}>Edit</Button>}
                />
                {editing ? (
                  <div className="g-stack">
                    <Field label="Headline" htmlFor="headline">
                      <TextInput id="headline" value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
                    </Field>
                    <Field label="Summary" htmlFor="summary">
                      <TextArea id="summary" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
                    </Field>
                    <Field label="Career goal" htmlFor="goal">
                      <TextArea id="goal" value={draft.careerGoal} onChange={(e) => setDraft({ ...draft, careerGoal: e.target.value })} />
                    </Field>
                    <Field label="Location" htmlFor="location">
                      <TextInput id="location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
                    </Field>
                    <div className="g-row" style={{ gap: 'var(--g-space-3)' }}>
                      <Field label="Salary from" htmlFor="salary-min">
                        <TextInput id="salary-min" type="number" value={draft.salaryMin} onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value })} />
                      </Field>
                      <Field label="Salary to" htmlFor="salary-max">
                        <TextInput id="salary-max" type="number" value={draft.salaryMax} onChange={(e) => setDraft({ ...draft, salaryMax: e.target.value })} />
                      </Field>
                    </div>
                    <div className="g-row" style={{ justifyContent: 'flex-end' }}>
                      <Button variant="subtle" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                      <Button variant="primary" onClick={saveProfile} loading={saving}>Save profile</Button>
                    </div>
                  </div>
                ) : (
                  <div className="g-stack">
                    <p className="g-muted" style={{ lineHeight: 1.7 }}>
                      {profile.summary || 'Your summary is where employers decide whether to keep reading. Add one.'}
                    </p>
                    {profile.careerGoal ? (
                      <div className="profile__goal">
                        <span className="g-eyebrow">Career goal</span>
                        <p style={{ fontSize: 'var(--g-text-sm)' }}>{profile.careerGoal}</p>
                      </div>
                    ) : null}
                    <div className="g-row" style={{ flexWrap: 'wrap' }}>
                      {profile.salaryExpectation.min > 0 ? (
                        <Badge>
                          {formatCompactMoney(profile.salaryExpectation.min, profile.salaryExpectation.currency)} –{' '}
                          {formatCompactMoney(profile.salaryExpectation.max, profile.salaryExpectation.currency)} /mo
                        </Badge>
                      ) : null}
                      {profile.workTypes.map((mode) => (
                        <Badge key={mode}>{titleCase(mode)}</Badge>
                      ))}
                      {profile.openTo.map((type) => (
                        <Badge key={type}>{titleCase(type)}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              <Panel>
                <PanelHeader title="Skills" subtitle="Verified skills carry more weight with employers." />
                {profile.skills.length === 0 ? (
                  <EmptyState title="No skills listed yet" body="Skills drive your match scores. Add them from onboarding or edit your profile." />
                ) : (
                  <div className="profile__skills">
                    {profile.skills.map((skill) => (
                      <Meter
                        key={skill.id}
                        label={`${skill.name}${skill.verified ? ' ✓' : ''}`}
                        value={skill.level}
                        tone={skill.verified ? 'accent' : 'muted'}
                        hint={skill.verified ? `Verified · assessment ${skill.score ?? 90}%` : 'Self-assessed'}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              {profile.experience.length > 0 ? (
                <Panel>
                  <PanelHeader title="Experience" />
                  <ul className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
                    {profile.experience.map((entry) => (
                      <li key={entry.id} className="profile__timeline-item">
                        <p style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>{entry.title}</p>
                        <p className="g-muted" style={{ fontSize: 'var(--g-text-xs)' }}>
                          {entry.organization} · {entry.startDate} — {entry.endDate ?? 'present'}
                        </p>
                        {entry.summary ? (
                          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', marginTop: 4 }}>{entry.summary}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Panel>
                <PanelHeader title="Applications" subtitle="Everything you have in flight." />
                <ApplicationList />
              </Panel>
            </div>

            <div className="g-stack">
              <Panel>
                <PanelHeader title="Profile completeness" />
                <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
                  <Meter label="Complete" value={profile.completeness} suffix="%" />
                  <div className="profile__checklist">
                    {candidateService.missingProfileFields(profile).length === 0 ? (
                      <div className="profile__checklist-item">
                        <IconCheck size={16} style={{ color: 'var(--g-success)' }} />
                        Your profile is complete.
                      </div>
                    ) : (
                      candidateService.missingProfileFields(profile).map((field) => (
                        <div key={field.key} className="profile__checklist-item">
                          <span
                            aria-hidden="true"
                            style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--g-warning)', flex: 'none' }}
                          />
                          {field.label}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="CV" />
                <div className="profile__cv">
                  <IconDoc size={24} style={{ color: 'var(--g-accent)' }} />
                  <div className="profile__cv-info">
                    {profile.cv.hasCv ? (
                      <>
                        <p style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>{profile.cv.fileName}</p>
                        <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                          Stored with your profile. The AI reads it to find skill gaps.
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>No CV attached</p>
                        <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                          PDF or Word. Worth +25 XP and unlocks CV review.
                        </p>
                      </>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="g-sr-only" onChange={handleCvSelected} />
                  <Button variant={profile.cv.hasCv ? 'ghost' : 'primary'} onClick={() => fileInputRef.current?.click()}>
                    {profile.cv.hasCv ? 'Replace' : 'Upload CV'}
                  </Button>
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Career statistics" />
                <AsyncBoundary
                  query={statsQuery}
                  loading={<LoadingState rows={1} label="Loading statistics" />}
                  empty={<EmptyState title="No statistics yet" icon={<IconBriefcase size={22} />} />}
                >
                  {(stats) => (
                    <StatGrid>
                      <StatTile label="Reputation" value={reputation} accent="var(--g-accent)" />
                      <StatTile label="Missions" value={stats.completedMissions} />
                      <StatTile label="Certifications" value={stats.certifications} />
                      <StatTile label="Applications" value={stats.applications} />
                      <StatTile label="Interviews" value={stats.interviews} />
                      <StatTile label="Offers" value={stats.offers} />
                    </StatGrid>
                  )}
                </AsyncBoundary>
              </Panel>

              <Panel>
                <PanelHeader title="Career activity" subtitle="What you have actually done, in order." />
                <AsyncBoundary
                  query={activityQuery}
                  loading={<LoadingState rows={1} label="Loading activity" />}
                  empty={
                    <EmptyState
                      title="Nothing recorded yet"
                      body="Completing a mission, a course or an application puts it here — and makes it shareable."
                      icon={<IconAward size={22} />}
                    />
                  }
                >
                  {(activity) => (
                    <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
                      {activity.map((entry) => (
                        <li key={entry.id} className="ledger__row">
                          <span className="g-truncate">{entry.label}</span>
                          <span className="g-row" style={{ gap: 10, flex: 'none' }}>
                            <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                              {formatRelativeTime(entry.createdAt)}
                            </span>
                            {entry.xp > 0 ? <span className="ledger__xp">+{entry.xp} XP</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </AsyncBoundary>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </AsyncBoundary>
  );
}
