/**
 * Mission reminders: the nudge, with an off switch.
 *
 * Active missions the account has not been reminded about in 24h surface here
 * on load (outside quiet hours); each notice stamps the progress row so the
 * rule has something to read. Preferences persist per account. The backend
 * runs the same rule on a scheduler — this panel is the mock's honest
 * stand-in for a cron job, not a second implementation.
 */
import { useEffect, useState } from 'react';
import { Panel, PanelHeader, Button, Field, Select, Badge, EmptyState } from '../ui/index.js';
import { useMissionStore, selectActiveMissions } from '../../stores/missionStore.js';
import { useNotificationStore } from '../../stores/notificationStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as missionService from '../../services/missionService.js';

const QUIET_OPTIONS = [
  { id: 'none', label: 'No quiet hours' },
  { id: '22-7', label: 'Nights (22:00 – 07:00)' },
  { id: '9-17', label: 'Work hours (09:00 – 17:00)' },
];

function quietLabel(quietHours) {
  if (!quietHours) return 'none';
  if (quietHours.start === 22 && quietHours.end === 7) return '22-7';
  if (quietHours.start === 9 && quietHours.end === 17) return '9-17';
  return 'none';
}

function quietFromId(id) {
  if (id === '22-7') return { start: 22, end: 7 };
  if (id === '9-17') return { start: 9, end: 17 };
  return null;
}

export function MissionReminders() {
  const progress = useMissionStore((s) => s.progress);
  const active = useMissionStore(selectActiveMissions);
  const push = useNotificationStore((s) => s.push);
  const pushToast = useUiStore((s) => s.pushToast);

  const [prefs, setPrefs] = useState({ missionReminders: true, quietHours: null });
  const [remindedIds, setRemindedIds] = useState([]);

  useEffect(() => {
    missionService.getNotificationPreferences().then(setPrefs).catch(() => {});
  }, []);

  useEffect(() => {
    if (active.length === 0) return;
    const due = missionService.dueMissionReminders(progress);
    if (due.length === 0) return;
    due.forEach((mission) => {
      push({
        type: 'mission-reminder',
        title: `Still open: ${mission.title}`,
        body: `${mission.description} Pick it back up from the Missions page.`,
        route: '/missions',
      });
      missionService.markMissionReminded(mission.id, progress).catch(() => {});
    });
    setRemindedIds(due.map((m) => m.id));
    // Run once per mount: the stamp prevents a second notice within 24h.
  }, [active.length]);

  const toggle = async () => {
    const next = await missionService
      .saveNotificationPreferences({ missionReminders: !prefs.missionReminders })
      .catch((error) => {
        pushToast({ title: 'Could not save', body: error.message, tone: 'danger' });
        return null;
      });
    if (next) setPrefs(next);
  };

  const changeQuiet = async (id) => {
    const next = await missionService
      .saveNotificationPreferences({ quietHours: quietFromId(id) })
      .catch((error) => {
        pushToast({ title: 'Could not save', body: error.message, tone: 'danger' });
        return null;
      });
    if (next) setPrefs(next);
  };

  return (
    <Panel>
      <PanelHeader
        title="Mission reminders"
        subtitle="A nudge for missions you started but have not finished."
        action={
          <Button size="sm" variant={prefs.missionReminders ? 'subtle' : 'primary'} onClick={toggle}>
            {prefs.missionReminders ? 'Turn off' : 'Turn on'}
          </Button>
        }
      />
      {prefs.missionReminders ? (
        <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
          <Field label="Quiet hours" htmlFor="reminder-quiet">
            <Select id="reminder-quiet" value={quietLabel(prefs.quietHours)} onChange={(e) => changeQuiet(e.target.value)}>
              {QUIET_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {remindedIds.length === 0 ? (
            <EmptyState title="Nothing to nudge" body="Start a mission and leave it open for a day — the reminder will appear here and in your notifications." />
          ) : (
            <div className="g-row" style={{ flexWrap: 'wrap' }}>
              <Badge tone="accent">{remindedIds.length} reminder{remindedIds.length === 1 ? '' : 's'} sent</Badge>
            </div>
          )}
        </div>
      ) : (
        <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
          Reminders are off. Active missions will wait quietly until you return to them.
        </p>
      )}
    </Panel>
  );
}
