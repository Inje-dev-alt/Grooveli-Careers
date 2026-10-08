import { useEffect, useState } from 'react';
import { EmployerShell, EmployerPage } from '../components/employer/EmployerShell.jsx';
import {
  Panel,
  PanelHeader,
  Button,
  Badge,
  Tabs,
  SearchInput,
  CompanyMark,
  Meter,
  Modal,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconUser,
  IconAward,
  IconCheck,
} from '../components/ui/index.js';
import { useAsync } from '../hooks/useAsync.js';
import { useEmployerStore } from '../stores/employerStore.js';
import { useUiStore } from '../stores/uiStore.js';
import * as candidateService from '../services/candidateService.js';
import { statusLabel, statusTone, PIPELINE_ORDER } from '../utils/applicationStatus.js';
import { formatRelativeTime } from '../utils/format.js';

const TABS = [
  { id: 'pipeline', label: 'Your pipeline' },
  { id: 'discover', label: 'Discover candidates' },
];

/**
 * Candidate discovery and the hiring pipeline.
 *
 * What an employer sees is the career identity Grooveli actually produces:
 * verified skills with assessment scores, achievements, career level and real
 * activity. That is the point of the candidate side — evidence an employer can
 * act on, rather than claims they have to take on trust.
 */
export default function EmployerCandidates() {
  const [tab, setTab] = useState('pipeline');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const status = useEmployerStore((s) => s.status);
  const applications = useEmployerStore((s) => s.applications);
  const load = useEmployerStore((s) => s.load);
  const setApplicationStatus = useEmployerStore((s) => s.setApplicationStatus);
  const pushToast = useUiStore((s) => s.pushToast);

  const poolQuery = useAsync(() => candidateService.listCandidates({ search }), [search]);

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const advance = async (application, nextStatus) => {
    await setApplicationStatus(application.id, nextStatus);
    pushToast({
      title: `${application.candidate?.name ?? 'Candidate'} — ${statusLabel(nextStatus)}`,
      tone: 'success',
    });
  };

  return (
    <EmployerShell>
      <EmployerPage
        title="Candidates"
        lede="Skills here are backed by assessments, not self-ratings. What you see is what the candidate actually proved."
      >
        <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Candidate views" />

          {tab === 'pipeline' ? (
            <Panel>
              <PanelHeader title="Applications" subtitle="Move a candidate along the pipeline." />
              {applications.length === 0 ? (
                <EmptyState
                  title="No applications yet"
                  body="Publish a role and candidates who apply will appear here."
                  icon={<IconUser size={22} />}
                />
              ) : (
                <ul className="pipeline">
                  {applications.map((application) => {
                    const index = PIPELINE_ORDER.indexOf(application.status);
                    const nextStatus = index >= 0 ? PIPELINE_ORDER[index + 1] : null;
                    return (
                      <li key={application.id} className="pipeline__row">
                        <CompanyMark
                          name={application.candidate?.name ?? 'Candidate'}
                          color={application.candidate?.color ?? '#6c8cff'}
                        />
                        <div className="pipeline__who">
                          <p className="pipeline__name">{application.candidate?.name ?? 'Candidate'}</p>
                          <p className="pipeline__meta">
                            {application.jobTitle} · applied {formatRelativeTime(application.appliedAt)}
                          </p>
                        </div>
                        <Badge tone={statusTone(application.status)}>{statusLabel(application.status)}</Badge>
                        {application.candidate ? (
                          <Button size="sm" variant="ghost" onClick={() => setSelected(application.candidate)}>
                            View profile
                          </Button>
                        ) : null}
                        {nextStatus ? (
                          <Button size="sm" variant="primary" onClick={() => advance(application, nextStatus)}>
                            {statusLabel(nextStatus)}
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'discover' ? (
            <div className="g-stack">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search by name, skill or location"
                aria-label="Search candidates"
              />
              <AsyncBoundary
                query={poolQuery}
                loading={<LoadingState rows={3} label="Loading candidates" />}
                empty={<EmptyState title="No candidates match that" icon={<IconUser size={22} />} />}
              >
                {(candidates) => (
                  <ul className="g-stack">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <Panel pad="sm" className="candidate-card">
                          <div className="candidate-card__head">
                            <CompanyMark name={candidate.name} color={candidate.color} size="lg" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h3 className="candidate-card__name g-truncate">{candidate.name}</h3>
                              <p className="candidate-card__headline g-truncate">{candidate.headline}</p>
                            </div>
                            <Badge tone="accent">{candidate.matchScore}% match</Badge>
                          </div>

                          <div className="g-row" style={{ flexWrap: 'wrap' }}>
                            <Badge>Level {candidate.careerLevel}</Badge>
                            <Badge>Reputation {candidate.reputation}</Badge>
                            <Badge>{candidate.location}</Badge>
                          </div>

                          <div className="candidate-card__evidence">
                            <span className="g-eyebrow">Verified skills</span>
                            {candidate.skills.filter((s) => s.verified).map((skill) => (
                              <span key={skill.name} className="candidate-card__evidence-row">
                                <span className="g-row" style={{ gap: 6 }}>
                                  <IconCheck size={13} style={{ color: 'var(--g-success)' }} />
                                  {skill.name}
                                </span>
                                <span className="g-mono" style={{ color: 'var(--g-accent)' }}>{skill.score}%</span>
                              </span>
                            ))}
                          </div>

                          <Button size="sm" variant="ghost" onClick={() => setSelected(candidate)}>
                            View full profile
                          </Button>
                        </Panel>
                      </li>
                    ))}
                  </ul>
                )}
              </AsyncBoundary>
            </div>
          ) : null}
        </div>
      </EmployerPage>

      {selected ? (
        <Modal
          eyebrow="Candidate"
          title={selected.name}
          subtitle={selected.headline}
          size="md"
          onClose={() => setSelected(null)}
        >
          <div className="g-stack">
            <div className="g-row" style={{ flexWrap: 'wrap' }}>
              <Badge tone="accent">Career level {selected.careerLevel}</Badge>
              <Badge>Reputation {selected.reputation}</Badge>
              <Badge>{selected.location}</Badge>
            </div>

            <section className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
              <h3 className="g-eyebrow">Skills</h3>
              {selected.skills.map((skill) => (
                <Meter
                  key={skill.name}
                  label={`${skill.name}${skill.verified ? ' ✓' : ''}`}
                  value={skill.level}
                  tone={skill.verified ? 'accent' : 'muted'}
                  hint={skill.verified ? `Verified by Grooveli · assessment ${skill.score}%` : 'Self-assessed'}
                />
              ))}
            </section>

            <section className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
              <h3 className="g-eyebrow">Experience</h3>
              {selected.experience.map((entry) => (
                <div key={entry.title} className="profile__timeline-item">
                  <p style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>{entry.title}</p>
                  <p className="g-muted" style={{ fontSize: 'var(--g-text-xs)' }}>
                    {entry.organization} · {entry.years}
                  </p>
                </div>
              ))}
            </section>

            <section className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
              <h3 className="g-eyebrow">Achievements</h3>
              <div className="g-row" style={{ flexWrap: 'wrap' }}>
                {selected.achievements.map((achievement) => (
                  <Badge key={achievement} tone="accent">
                    <IconAward size={12} /> {achievement}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
              <h3 className="g-eyebrow">Career activity</h3>
              <div className="candidate-card__activity">
                {selected.activity.map((item) => (
                  <span key={item}>· {item}</span>
                ))}
              </div>
            </section>
          </div>
        </Modal>
      ) : null}
    </EmployerShell>
  );
}
