import { useEffect, useRef, useState } from 'react';
import './profile.css';
import {
  Panel,
  Badge,
  Button,
  Select,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  CompanyMark,
  IconBriefcase,
  IconAlert,
  IconCheck,
  IconSend,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import * as applicationService from '../../services/applicationService.js';
import * as socialService from '../../services/socialService.js';
import * as candidateService from '../../services/candidateService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';
import { formatRelativeTime } from '../../utils/format.js';
import { statusLabel, statusTone, WITHDRAWABLE, isActiveStatus } from '../../utils/applicationStatus.js';
import { useUiStore } from '../../stores/uiStore.js';

/**
 * Application history - the candidate's side of the living pipeline.
 *
 * This is where the career loop closes. An application is not a submission
 * that vanishes: it moves through stages, sometimes with a reason attached,
 * and an offer lands here as a decision - accept, and the role joins your
 * profile; decline, and the search continues. A rejection with feedback feeds
 * the Bounce Back mission, which turns the no into the next move.
 */
export function ApplicationList({ limit }) {
  const query = useAsync(() => applicationService.listApplications(), []);
  const pushToast = useUiStore((s) => s.pushToast);

  const [expandedId, setExpandedId] = useState(null);
  const [timeline, setTimeline] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [confirmAcceptId, setConfirmAcceptId] = useState(null);
  const [referralFor, setReferralFor] = useState(null);
  const [referralConnections, setReferralConnections] = useState([]);
  const [referralPick, setReferralPick] = useState('');

  const seenRejections = useRef(new Set());

  /* A rejection is career input: fire the event once per application, then
     acknowledge it so a reload cannot replay the notice. */
  useEffect(() => {
    const apps = query.data ?? [];
    apps
      .filter((a) => a.status === 'rejected' && !a.rejectionAcknowledged)
      .forEach((a) => {
        if (seenRejections.current.has(a.id)) return;
        seenRejections.current.add(a.id);
        recordCareerEvent(CAREER_EVENTS.APPLICATION_REJECTED, {
          label: `Not progressing - ${a.jobTitle}`,
          silent: true,
          ledger: true,
          context: { companyName: a.companyName, feedback: a.feedback },
        });
        applicationService
          .acknowledgeRejection(a.id)
          .then(() => query.refetch())
          .catch(() => {});
      });
  }, [query.data]);

  const refresh = () => query.refetch();

  const respondToOffer = async (application, decision) => {
    setBusyId(application.id);
    try {
      const updated = await applicationService.respondToOffer(application.id, decision);
      if (decision === 'accept') {
        recordCareerEvent(CAREER_EVENTS.OFFER_ACCEPTED, {
          label: `Accepted ${application.jobTitle} at ${application.companyName}`,
          shareable: true,
          context: { jobId: application.jobId, companyName: application.companyName },
        });
        // The job joins the career story - the profile timeline now shows it.
        candidateService
          .addExperience({
            title: application.jobTitle,
            organization: application.companyName,
            startDate: new Date().toISOString().slice(0, 7),
            summary: 'Accepted through Grooveli City.',
          })
          .catch(() => {});
        pushToast({
          title: 'Offer accepted',
          body: `${application.companyName} is now on your profile. Congratulations - this was earned.`,
          tone: 'success',
          duration: 6000,
        });
      } else {
        recordCareerEvent(CAREER_EVENTS.OFFER_DECLINED, {
          label: `Declined ${application.jobTitle}`,
          silent: true,
          ledger: true,
        });
        pushToast({ title: 'Offer declined', body: 'The search continues.', tone: 'info' });
      }
      setConfirmAcceptId(null);
      await refresh();
      return updated;
    } catch (error) {
      pushToast({ title: 'Could not respond', body: error.message, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (application) => {
    setBusyId(application.id);
    try {
      await applicationService.withdrawApplication(application.id);
      pushToast({ title: 'Application withdrawn', tone: 'info' });
      await refresh();
    } catch (error) {
      pushToast({ title: 'Could not withdraw', body: error.message, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const toggleTimeline = async (application) => {
    if (expandedId === application.id) {
      setExpandedId(null);
      return;
    }
    if (!timeline[application.id]) {
      const events = await applicationService.listApplicationEvents(application.id).catch(() => []);
      setTimeline((prev) => ({ ...prev, [application.id]: events }));
    }
    setExpandedId(application.id);
  };

  const openReferral = async (application) => {
    if (referralFor?.id === application.id) {
      setReferralFor(null);
      return;
    }
    const connections = await socialService.listConnections().catch(() => []);
    const connected = connections.filter((c) => c.status === 'connected');
    if (connected.length === 0) {
      pushToast({
        title: 'No connections yet',
        body: 'Connect with someone in the Network first - referrals come from people who know your work.',
        tone: 'info',
      });
      return;
    }
    setReferralConnections(connected);
    setReferralPick(connected[0].userId);
    setReferralFor(application);
  };

  const sendReferral = async () => {
    const application = referralFor;
    const connection = referralConnections.find((c) => c.userId === referralPick);
    if (!application || !connection) return;
    setBusyId(application.id);
    try {
      await socialService.requestReferral({
        connectionId: connection.userId,
        applicationId: application.id,
        jobTitle: application.jobTitle,
        companyName: application.companyName,
      });
      recordCareerEvent(CAREER_EVENTS.REFERRAL_REQUESTED, {
        label: `Asked ${connection.name} for a referral`,
        silent: true,
        ledger: true,
        shareable: true,
      });
      pushToast({
        title: `Referral requested`,
        body: `${connection.name} has been asked to refer you for ${application.jobTitle}.`,
        tone: 'success',
      });
      setReferralFor(null);
    } catch (error) {
      pushToast({ title: 'Could not send the request', body: error.message, tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={2} label="Loading applications" />}
      errorTitle="Could not load applications"
      empty={
        <EmptyState
          title="No applications yet"
          body="Applications you submit from anywhere in Grooveli City show up here with their status."
          icon={<IconBriefcase size={22} />}
        />
      }
    >
      {(applications) => (
        <ul className="g-stack" style={{ gap: 'var(--g-space-2)' }}>
          {(limit ? applications.slice(0, limit) : applications).map((application) => {
            const canWithdraw = WITHDRAWABLE.has(application.status);
            const isOffer = application.status === 'offer';
            const showReferral = isActiveStatus(application.status);
            const events = timeline[application.id] ?? [];

            return (
              <li key={application.id}>
                <Panel pad="sm" className="application">
                  <CompanyMark name={application.companyName} color="#6c8cff" />
                  <div className="application__body">
                    <p className="application__title g-truncate">{application.jobTitle}</p>
                    <p className="application__company g-truncate">
                      {application.companyName} · {formatRelativeTime(application.updatedAt)}
                    </p>
                  </div>
                  <div className="g-row" style={{ gap: 8, flex: 'none' }}>
                    <Badge tone={statusTone(application.status)}>{statusLabel(application.status)}</Badge>
                  </div>
                </Panel>

                {application.feedback ? (
                  <Panel pad="sm" style={{ marginTop: 6 }}>
                    <div className="g-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <IconAlert size={18} style={{ color: 'var(--g-warning, #e8b04b)', flex: 'none', marginTop: 2 }} />
                      <div>
                        <p className="g-eyebrow" style={{ marginBottom: 4 }}>Feedback from {application.companyName}</p>
                        <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.6 }}>
                          {application.feedback}
                        </p>
                      </div>
                    </div>
                  </Panel>
                ) : null}

                {isOffer ? (
                  <Panel pad="sm" style={{ marginTop: 6 }}>
                    <p style={{ fontWeight: 600, fontSize: 'var(--g-text-sm)', marginBottom: 8 }}>
                      You have an offer. Accepting adds this role to your profile.
                    </p>
                    {confirmAcceptId === application.id ? (
                      <div className="g-row" style={{ gap: 8 }}>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busyId === application.id}
                          onClick={() => respondToOffer(application, 'accept')}
                        >
                          Confirm - accept the offer
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmAcceptId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="g-row" style={{ gap: 8 }}>
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<IconCheck size={15} />}
                          onClick={() => setConfirmAcceptId(application.id)}
                        >
                          Accept offer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busyId === application.id}
                          onClick={() => respondToOffer(application, 'decline')}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </Panel>
                ) : null}

                <div className="g-row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="ghost" onClick={() => toggleTimeline(application)}>
                    {expandedId === application.id ? 'Hide history' : 'History'}
                  </Button>
                  {showReferral ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<IconSend size={14} />}
                      onClick={() => openReferral(application)}
                    >
                      Ask for a referral
                    </Button>
                  ) : null}
                  {canWithdraw ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busyId === application.id}
                      onClick={() => withdraw(application)}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </div>

                {referralFor?.id === application.id ? (
                  <Panel pad="sm" style={{ marginTop: 6 }}>
                    <p className="g-eyebrow" style={{ marginBottom: 6 }}>Who should refer you?</p>
                    <div className="g-row" style={{ gap: 8 }}>
                      <Select
                        value={referralPick}
                        aria-label="Choose a connection"
                        onChange={(e) => setReferralPick(e.target.value)}
                      >
                        {referralConnections.map((c) => (
                          <option key={c.userId} value={c.userId}>
                            {c.name} - {c.headline}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="primary" loading={busyId === application.id} onClick={sendReferral}>
                        Send request
                      </Button>
                    </div>
                  </Panel>
                ) : null}

                {expandedId === application.id ? (
                  <Panel pad="sm" style={{ marginTop: 6 }}>
                    <p className="g-eyebrow" style={{ marginBottom: 6 }}>Stage history</p>
                    {events.length === 0 ? (
                      <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
                        No recorded transitions yet.
                      </p>
                    ) : (
                      <ul className="g-stack" style={{ gap: 4 }}>
                        {events.map((event) => (
                          <li key={event.id} className="g-row-between" style={{ fontSize: 'var(--g-text-sm)' }}>
                            <span>
                              {event.fromStatus ? statusLabel(event.fromStatus) : 'Started'} →{' '}
                              <strong>{statusLabel(event.toStatus)}</strong>
                              {event.actor === 'system' ? ' · pipeline' : ''}
                            </span>
                            <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
                              {formatRelativeTime(event.at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AsyncBoundary>
  );
}