/**
 * The public front door.
 *
 * The whole first screen is the city, with the sign-in call to action at the
 * bottom centre and nothing else competing for it. What someone actually does
 * in Grooveli is shown rather than listed — people walking to work with
 * laptops, lit windows with someone at a desk or pacing through a call, XP
 * surfacing off the skyline — because the pitch is that this is a career
 * platform you walk through, and a bulleted list of that claim argues for it
 * instead of demonstrating it.
 *
 * The ten paths and the activity cards stayed, below the fold. They are the
 * reason to sign up, and a visitor who wants the detail before committing can
 * scroll to it; a visitor who does not can sign in without reading a word.
 *
 * No session, no data and no game state is touched here, so this screen can be
 * redesigned freely without risking the product behind it.
 */
import { Link } from 'react-router-dom';
import '../components/landing/landing.css';
import { LandingCity } from '../components/landing/LandingCity.jsx';
import {
  Button,
  Badge,
  IconTarget,
  IconBriefcase,
  IconAward,
  IconUser,
  IconSparkle,
  IconChevronRight,
} from '../components/ui/index.js';
import { CAREER_PATHS } from '../data/careerPaths.js';

/** What the city is for. The same five things the scene is showing. */
const ACTIVITIES = [
  {
    icon: IconTarget,
    title: 'Run missions',
    body: 'Career work broken into steps that pay XP — and only for things that moved your career, never for time spent in the app.',
  },
  {
    icon: IconAward,
    title: 'Pass skill challenges',
    body: 'Assessments and interview simulations that go on your record. A score an employer can check beats a claim they cannot.',
  },
  {
    icon: IconBriefcase,
    title: 'Walk into companies',
    body: 'Every employer has an office you can visit: reception, their open roles with your match against each, and their notice board.',
  },
  {
    icon: IconUser,
    title: 'Meet people who are there',
    body: 'See who else is standing in a lobby and start a conversation. Two people in the same room beats a cold message.',
  },
  {
    icon: IconSparkle,
    title: 'Ask the career AI',
    body: 'Find the path your skills already point at, and what stands between you and the next one.',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      {/*
        Outside the hero and fixed to the viewport, so the city is behind the
        WHOLE page rather than behind its first screen. Everything below
        scrolls over it on glass.
      */}
      <LandingCity />

      <div className="landing__content">
        <section className="landing__hero">
          <header className="landing__brand">
            <span className="landing__mark">G</span>
            <div>
              <p className="landing__wordmark">Grooveli</p>
              <p className="g-eyebrow">Careers</p>
            </div>
          </header>

          <div className="landing__headline">
            <Badge tone="accent">Grooveli City is open</Badge>
            <h1 className="landing__title">
              The city where people
              <br />
              <span className="g-gradient-text">build careers.</span>
            </h1>
            <p className="landing__lede">
              Walk the districts. Run missions, pass interviews, finish courses and earn a
              profile employers can verify. Ten paths, one city, and proof instead of
              promises.
            </p>
          </div>

          {/*
            The one thing the page is asking for, centred on the bottom edge.
            It is the last thing in the grid with a 1fr spacer above it, so it
            sits on the bottom at every viewport height without a magic offset —
            and `dvh` on the hero keeps it clear of a phone browser's chrome,
            which is exactly where `vh` would hide it.
          */}
          <div className="landing__cta">
            <div className="landing__cta-panel">
              <div className="landing__cta-buttons">
                <Link to="/signup">
                  <Button variant="primary" size="lg" block>
                    Enter the city
                  </Button>
                </Link>
                <Link to="/signin">
                  <Button variant="ghost" size="lg" block>
                    I already have an account
                  </Button>
                </Link>
              </div>
              <p className="landing__cta-note">
                Free to join. Pick your path after you sign up.
              </p>
            </div>

            <span className="landing__scroll-hint">
              See what you do here
              <IconChevronRight size={12} style={{ transform: 'rotate(90deg)' }} />
            </span>
          </div>
        </section>

        <section className="landing__below">
          <h2 className="landing__section-title">What you actually do here</h2>

          <div className="landing__activities">
            {ACTIVITIES.map((activity) => {
              const Icon = activity.icon;
              return (
                <article key={activity.title} className="activity">
                  <span className="activity__icon">
                    <Icon size={17} />
                  </span>
                  <p className="activity__title">{activity.title}</p>
                  <p className="activity__body">{activity.body}</p>
                </article>
              );
            })}
          </div>

          <h2 className="landing__section-title">Ten paths to start on</h2>

          <div className="landing__paths">
            {CAREER_PATHS.map((path) => (
              <div key={path.id} className="landing__path">
                <div style={{ minWidth: 0 }}>
                  <p className="landing__path-title">{path.title}</p>
                  <p className="landing__path-tagline g-truncate">{path.tagline}</p>
                </div>
                {/* No `tone`: there is no `neutral` badge style, so naming one
                    emits a class that promises a look it does not have. */}
                <Badge>{path.core[0]}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
