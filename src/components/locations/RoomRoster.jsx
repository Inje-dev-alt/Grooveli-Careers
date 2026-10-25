import './locations.css';
import { Badge, EmptyState, LoadingState, Select, Field, IconUser } from '../ui/index.js';
import { usePresenceStore, selectUnnamedHere } from '../../stores/presenceStore.js';
import { initials } from '../../utils/format.js';

/**
 * Who else is in this room.
 *
 * The panel behind the meeting table in a company's office, and the first
 * thing in Grooveli that shows one player another. It reads the presence store
 * rather than fetching: the heartbeat is already running for the whole app, so
 * a panel that loaded its own copy would be a second request for a fact that
 * arrived a few seconds ago — and would go stale the moment it closed.
 *
 * NAMED AND COUNTED ARE ALLOWED TO DISAGREE. `hereCount` is everyone in the
 * room; `here` is the ones whose privacy setting lets you see who they are.
 * The difference is stated out loud rather than hidden, because a room that
 * says "3 others here" and lists one looks broken, while a room that says two
 * of them have not shared a profile is simply telling the truth — the same
 * truth a real lobby tells, where you can see a person without knowing their
 * name.
 */

const VISIBILITY_OPTIONS = [
  { value: 'everyone', label: 'Everyone — anyone in the room sees my name' },
  { value: 'connections', label: 'Connections only — others just see someone is here' },
  { value: 'nobody', label: 'Nobody — do not show me at all' },
];

export function RoomRoster() {
  const started = usePresenceStore((s) => s.started);
  const here = usePresenceStore((s) => s.here);
  const hereCount = usePresenceStore((s) => s.hereCount);
  const unnamed = usePresenceStore(selectUnnamedHere);
  const visibility = usePresenceStore((s) => s.visibility);
  const setVisibility = usePresenceStore((s) => s.setVisibility);

  // The first heartbeat has not answered yet. An unanswered question and an
  // empty room look identical otherwise, and "nobody is here" is the wrong
  // thing to say about a room nobody has looked in.
  if (!started) return <LoadingState rows={2} label="Looking around the room" />;

  return (
    <div className="g-stack" style={{ gap: 'var(--g-space-4)' }}>
      {hereCount === 0 ? (
        <EmptyState
          title="Nobody else here right now"
          body="Grooveli is young and the city is quiet. A company's lobby fills up while it is hiring, so that is the place to look."
          icon={<IconUser size={22} />}
        />
      ) : (
        <>
          <p className="roster__count">
            {hereCount === 1 ? '1 other person is here' : `${hereCount} other people are here`}
          </p>

          <ul className="roster">
            {here.map((person) => (
              <li key={person.id} className="roster__person">
                <span className="roster__avatar" style={{ background: person.color }}>
                  {initials(person.name)}
                </span>
                <div className="roster__body">
                  <div className="roster__name g-truncate">{person.name}</div>
                  <div className="roster__headline g-truncate">{person.headline}</div>
                </div>
                <Badge>Lv {person.careerLevel}</Badge>
              </li>
            ))}
          </ul>

          {unnamed > 0 ? (
            <p className="roster__note">
              {unnamed === 1
                ? '1 of them has not shared their profile outside their own network.'
                : `${unnamed} of them have not shared their profile outside their own network.`}
            </p>
          ) : null}

          {/*
            Chat is the next commit. Saying so is the same bargain the table
            itself made before this panel existed: a feature that is not here
            yet should say so, rather than offering a button that does nothing.
          */}
          <p className="roster__note">
            You will be able to start a conversation from here. Standing in the same
            lobby is a better introduction than a cold message, which is the point.
          </p>
        </>
      )}

      {/*
        The privacy control lives in the room and not only in a settings
        screen, because this is the moment anyone thinks about it: the first
        time you realise other people can see where you are standing is the
        first time you want to decide whether they should.
      */}
      <Field
        label="Who can see you"
        htmlFor="presence-visibility"
        hint="Being seen in a company's lobby is visible to real people, so this is yours to set."
      >
        <Select
          id="presence-visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
        >
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
