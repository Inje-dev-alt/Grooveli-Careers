import './landing.css';

/**
 * The animated city on the front door.
 *
 * Named `LandingCity` and not `CityScene`: `game/scenes/CityScene.js` is the
 * Phaser scene that renders the actual playable city, and two files with that
 * name in one codebase is a trap for whoever greps for it next.
 *
 * Hand-drawn SVG rather than artwork, for three reasons: it themes off the
 * same tokens as the rest of the product so it can never drift from the
 * palette, it is a few kilobytes instead of a few hundred, and it stays sharp
 * on any display without a second asset.
 *
 * HOW THE DEPTH WORKS. Five layers, each moving at its own rate and drawn with
 * its own contrast: the far skyline is dim, desaturated and barely moves; the
 * street is bright, detailed and moves fastest. That difference in contrast
 * does more for the sense of distance than the parallax does — a far layer
 * that is merely slower still reads as flat.
 *
 * EVERYTHING ANIMATES ON `transform` AND `opacity` ONLY. Those are the two
 * properties a browser can hand to the compositor, so a sceneful of moving
 * people costs no layout and no repaint. Animating `left` instead would
 * relayout the page on every frame of every walker.
 *
 * The whole thing stops under `prefers-reduced-motion` — see landing.css. A
 * drifting, blinking, parallaxing page is exactly what that setting is for,
 * and the scene is composed so it is still a picture when nothing moves.
 */

/* --------------------------------------------------------------- people --- */

/**
 * One walker, built from parts rather than drawn per pose.
 *
 * The legs and arms are separate groups so the walk cycle is three small
 * rotations instead of a sprite sheet, which means a new character is a line
 * of data at the bottom of this file.
 */
function Walker({ skin, clothes, accent, prop }) {
  return (
    <svg className="walker__body" viewBox="0 0 44 96" aria-hidden="true">
      {/* Contact shadow. Without something under the feet a figure floats. */}
      <ellipse className="walker__shadow" cx="22" cy="93" rx="13" ry="3.2" />

      {/* Grouped for structure only — the stride is on each leg, so this
          wrapper deliberately carries no class to style. */}
      <g>
        <rect className="walker__leg walker__leg--back" x="18" y="58" width="7" height="34" rx="3.5" />
        <rect className="walker__leg walker__leg--front" x="23" y="58" width="7" height="34" rx="3.5" />
      </g>

      {/* Torso, with a lighter panel down one side so the figure has a lit
          edge facing the street lamps rather than reading as a flat block. */}
      <path
        d="M14 34 q8-5 16 0 l3 26 q-11 4-22 0 z"
        fill={clothes}
      />
      <path d="M26 31 q4 1 4 3 l3 26 q-3 1-5 1 z" fill="#ffffff" opacity="0.1" />

      <g className="walker__arm walker__arm--back">
        <rect x="11" y="36" width="6" height="26" rx="3" fill={clothes} />
      </g>

      {/* Head: hair over face so a single path change restyles a character. */}
      <circle cx="22" cy="24" r="10" fill={skin} />
      <path d="M12 22 q2-11 10-11 t10 11 q-4-6-10-6 t-10 6 z" fill="#1b2136" />
      <circle cx="18" cy="25" r="1.1" fill="#1b2136" opacity="0.75" />
      <circle cx="26" cy="25" r="1.1" fill="#1b2136" opacity="0.75" />

      <g className="walker__arm walker__arm--front">
        <rect x="27" y="36" width="6" height="26" rx="3" fill={clothes} />
        <WalkerProp prop={prop} accent={accent} skin={skin} />
      </g>
    </svg>
  );
}

/** What the walker is carrying — the whole point of the crowd. */
function WalkerProp({ prop, accent, skin }) {
  if (prop === 'laptop') {
    return (
      <g>
        <rect x="19" y="56" width="22" height="14" rx="2" fill="#243053" />
        <rect x="21" y="58" width="18" height="10" rx="1" fill={accent} opacity="0.85" />
        <rect x="19" y="68" width="22" height="3" rx="1.5" fill="#39466f" />
      </g>
    );
  }
  if (prop === 'phone') {
    return (
      <g>
        {/* Arm raised to the ear, so the pose reads at a glance. */}
        <rect x="27" y="30" width="6" height="18" rx="3" fill={skin} opacity="0" />
        <rect className="walker__phone" x="29" y="20" width="7" height="12" rx="2" fill="#243053" />
        <rect className="walker__phone" x="30" y="21.5" width="5" height="9" rx="1" fill={accent} opacity="0.9" />
      </g>
    );
  }
  if (prop === 'coffee') {
    return (
      <g>
        <path d="M28 58 h9 l-1.5 11 h-6 z" fill="#f3ead9" />
        <rect x="27" y="55" width="11" height="4" rx="1.5" fill={accent} />
        <path className="walker__steam" d="M32 52 q3-3 0-6" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.5" strokeLinecap="round" />
      </g>
    );
  }
  if (prop === 'folder') {
    return (
      <g>
        <rect x="24" y="54" width="16" height="20" rx="2" fill={accent} />
        <rect x="27" y="58" width="10" height="2" rx="1" fill="#ffffff" opacity="0.6" />
        <rect x="27" y="63" width="7" height="2" rx="1" fill="#ffffff" opacity="0.4" />
      </g>
    );
  }
  return null;
}

/* ----------------------------------------------------- window vignettes --- */

/** Someone at a desk, seen through a window. */
function DeskScene({ accent }) {
  return (
    <g>
      <rect x="6" y="26" width="28" height="3" rx="1.5" fill="#2b3861" />
      <rect className="vignette__screen" x="20" y="13" width="14" height="11" rx="1.5" fill={accent} />
      <circle cx="13" cy="18" r="5" fill="#f0c9a4" />
      <path d="M7 29 q6-8 12 0 z" fill="#4a5c96" />
    </g>
  );
}

/** Someone on a call, pacing. */
function CallScene({ accent }) {
  return (
    <g>
      <g className="vignette__pacer">
        <circle cx="16" cy="15" r="5" fill="#e8b98f" />
        <path d="M10 29 q6-9 12 0 z" fill={accent} opacity="0.85" />
        <rect x="20" y="12" width="3" height="6" rx="1.2" fill="#243053" />
      </g>
    </g>
  );
}

/** Two people at a board — the meeting. */
function MeetingScene({ accent }) {
  return (
    <g>
      <rect x="4" y="10" width="15" height="12" rx="1" fill={accent} opacity="0.7" />
      <path d="M6 13 l4 4 l6-6" stroke="#06131c" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="25" cy="17" r="4.5" fill="#f0c9a4" />
      <path d="M20 29 q5-8 10 0 z" fill="#4a5c96" />
      <circle cx="34" cy="18" r="4" fill="#d7a97f" />
      <path d="M30 29 q4-7 8 0 z" fill="#5f71ad" />
    </g>
  );
}

const VIGNETTES = { desk: DeskScene, call: CallScene, meeting: MeetingScene };

/** One lit window with a person in it. */
function Window({ kind, accent, x, y, delay }) {
  const Scene = VIGNETTES[kind];
  return (
    <div className="window" style={{ left: `${x}%`, top: `${y}%`, '--delay': `${delay}s` }}>
      <div className="window__glass">
        <svg viewBox="0 0 40 30" aria-hidden="true">
          <Scene accent={accent} />
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the data --- */

const TEAL = '#5be3c8';
const BLUE = '#6c8cff';
const VIOLET = '#b98cff';
const AMBER = '#ffc46b';

/**
 * The crowd.
 *
 * `scale` is doing the depth work and `duration` the rest: a figure further
 * back is smaller AND slower, because something distant crossing the view as
 * quickly as something near is the single thing that breaks a parallax scene.
 * `offset` is a negative animation-delay, which starts each walker partway
 * through its own crossing so the street is already busy on the first frame
 * rather than filling up over twenty seconds.
 *
 * `far` and `still` are carried here rather than worked out in CSS: the
 * street also contains a kerb and four lamps, so an `nth-child` rule counts
 * those too and picks the wrong figures. `far` drops the smallest three on a
 * phone; `still` is where each one stands when motion is turned off.
 */
const WALKERS = [
  { id: 'w1', prop: 'laptop', skin: '#8d5a3b', clothes: '#3f5296', accent: TEAL, scale: 0.52, bottom: 30, duration: 46, offset: -4, flip: false, far: true, still: 12 },
  { id: 'w2', prop: 'phone', skin: '#f0c9a4', clothes: '#5c4a8f', accent: BLUE, scale: 0.58, bottom: 27, duration: 39, offset: -22, flip: true, far: true, still: 34 },
  { id: 'w3', prop: 'coffee', skin: '#6b4027', clothes: '#2f6f63', accent: AMBER, scale: 0.7, bottom: 20, duration: 33, offset: -11, flip: false, far: true, still: 62 },
  { id: 'w4', prop: 'folder', skin: '#e8b98f', clothes: '#8f4a63', accent: VIOLET, scale: 0.78, bottom: 15, duration: 29, offset: -25, flip: true, still: 80 },
  { id: 'w5', prop: 'laptop', skin: '#c98a5e', clothes: '#38518c', accent: TEAL, scale: 0.9, bottom: 8, duration: 25, offset: -6, flip: false, still: 22 },
  { id: 'w6', prop: 'phone', skin: '#4a2d1c', clothes: '#4d6f3f', accent: TEAL, scale: 1, bottom: 2, duration: 22, offset: -16, flip: false, still: 52 },
  { id: 'w7', prop: 'coffee', skin: '#f0c9a4', clothes: '#8a5f2e', accent: AMBER, scale: 1.05, bottom: -1, duration: 20, offset: -31, flip: true, still: 86 },
];

/** Lit windows, with somebody in each one doing the work. */
const WINDOWS = [
  { id: 'n1', kind: 'desk', accent: TEAL, x: 9, y: 34, delay: 0 },
  { id: 'n2', kind: 'call', accent: BLUE, x: 20, y: 25, delay: 1.4 },
  { id: 'n3', kind: 'meeting', accent: AMBER, x: 31, y: 39, delay: 2.9 },
  { id: 'n4', kind: 'desk', accent: VIOLET, x: 47, y: 22, delay: 0.7 },
  { id: 'n5', kind: 'desk', accent: TEAL, x: 58, y: 36, delay: 3.6 },
  { id: 'n6', kind: 'call', accent: AMBER, x: 69, y: 28, delay: 2.1 },
  { id: 'n7', kind: 'meeting', accent: TEAL, x: 82, y: 33, delay: 4.3 },
  { id: 'n8', kind: 'desk', accent: BLUE, x: 91, y: 44, delay: 1.9 },
];

/**
 * XP bubbles rising off the city.
 *
 * The one piece of the picture that is about the product rather than the
 * place: career work in Grooveli pays XP, so the city visibly pays it out.
 */
const MOTES = [
  { id: 'm1', label: '+25 XP', x: 16, delay: 0, duration: 11 },
  { id: 'm2', label: 'Mission complete', x: 38, delay: 4.5, duration: 13 },
  { id: 'm3', label: '+200 XP', x: 63, delay: 2.2, duration: 12 },
  { id: 'm4', label: 'Interview passed', x: 85, delay: 7, duration: 14 },
];

/** A tower in the skyline. Height and offset only — the CSS draws it. */
const SKYLINE = [
  { id: 's1', x: 2, w: 9, h: 46 }, { id: 's2', x: 12, w: 6, h: 62 },
  { id: 's3', x: 19, w: 11, h: 38 }, { id: 's4', x: 31, w: 7, h: 70 },
  { id: 's5', x: 39, w: 9, h: 52 }, { id: 's6', x: 49, w: 6, h: 78 },
  { id: 's7', x: 56, w: 10, h: 44 }, { id: 's8', x: 67, w: 7, h: 66 },
  { id: 's9', x: 75, w: 11, h: 50 }, { id: 's10', x: 87, w: 8, h: 72 },
  { id: 's11', x: 96, w: 6, h: 40 },
];

export function LandingCity() {
  return (
    <div className="scene" aria-hidden="true">
      {/* 1. Sky: two slow-drifting colour washes crossing each other. */}
      <div className="scene__sky" />
      <div className="scene__aurora scene__aurora--a" />
      <div className="scene__aurora scene__aurora--b" />
      <div className="scene__stars" />

      {/* 2. Far skyline: dim, blurred, almost still. */}
      <div className="scene__layer scene__layer--far">
        {SKYLINE.map((t) => (
          <div
            key={t.id}
            className="tower tower--far"
            style={{ left: `${t.x}%`, width: `${t.w}%`, height: `${t.h}%` }}
          />
        ))}
      </div>

      {/* 3. Mid-ground: the buildings people are actually working in. */}
      <div className="scene__layer scene__layer--mid">
        <div className="block block--a" />
        <div className="block block--b" />
        <div className="block block--c" />
        <div className="block block--d" />
        {WINDOWS.map((w) => (
          <Window key={w.id} {...w} />
        ))}
      </div>

      {/* 4. The street, and the people on it. */}
      <div className="scene__street">
        <div className="scene__kerb" />
        {[18, 44, 70, 93].map((x) => (
          <div key={x} className="lamp" style={{ left: `${x}%` }}>
            <span className="lamp__pole" />
            <span className="lamp__glow" />
          </div>
        ))}

        {WALKERS.map((w) => (
          <div
            key={w.id}
            className={`walker${w.flip ? ' walker--reverse' : ''}${w.far ? ' walker--far' : ''}`}
            style={{
              '--scale': w.scale,
              '--duration': `${w.duration}s`,
              '--offset': `${w.offset}s`,
              '--still': `${w.still}vw`,
              bottom: `${w.bottom}%`,
            }}
          >
            <div className="walker__bob">
              <Walker skin={w.skin} clothes={w.clothes} accent={w.accent} prop={w.prop} />
            </div>
          </div>
        ))}
      </div>

      {/* 5. The product, surfacing out of the city. */}
      {MOTES.map((m) => (
        <span
          key={m.id}
          className="mote"
          style={{ left: `${m.x}%`, '--delay': `${m.delay}s`, '--duration': `${m.duration}s` }}
        >
          {m.label}
        </span>
      ))}

      {/* Vignette and a gradient floor so the CTA at the bottom always has
          contrast to sit on, whatever is walking past behind it. */}
      <div className="scene__vignette" />
    </div>
  );
}
