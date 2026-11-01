import { useEffect, useState } from 'react';
import './shell.css';
import * as tickerService from '../../services/tickerService.js';

/**
 * The live strip along the bottom of the platform.
 *
 * Two things interleaved: what people here have just done, and what is
 * happening in the market outside. Either alone is half a ticker — only our
 * own achievements reads as marketing, only headlines reads as somebody's RSS
 * reader left running in a corner.
 *
 * RENDERS NOTHING WHEN IT HAS NOTHING. A ticker with one item scrolling past
 * forever is worse than no ticker, and an empty strip is furniture. On a new
 * deployment, before anybody has achieved anything and before the first news
 * fetch, this is simply absent.
 */
export function Ticker({ inWorld = false }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      tickerService
        .getTicker()
        .then((next) => {
          if (cancelled) return;
          setItems(next);
          /*
           * Say why the strip is absent, in development.
           *
           * It hides itself below two items, which is right — but "nothing
           * rendered" and "nothing to render" look identical from outside,
           * and that has already cost two rounds of guessing. The reasons are
           * almost always one of three: the news cache is empty because the
           * scheduler has not run, nobody has earned a milestone the
           * allowlist admits, or the endpoint is not deployed yet.
           */
          if (import.meta.env.DEV && next.length < 2) {
            const news = next.filter((item) => item.kind === 'news').length;
            console.info(
              `[ticker] hidden: ${next.length} item(s) — ${news} headline(s), ` +
                `${next.length - news} milestone(s). Needs at least 2. ` +
                'No headlines means the news cache is empty; no milestones means ' +
                'nobody has completed a course, challenge, interview, assessment or mission.',
            );
          }
        })
        .catch((error) => {
          // Ambient: a failed fetch of a ticker is not worth an error state on
          // a page somebody came to for something else. Still said out loud in
          // development, because silence here reads as "the feature is broken".
          if (import.meta.env.DEV) {
            console.warn('[ticker] could not load:', error?.message ?? error);
          }
        });

    load();
    // Slow on purpose. Milestones arrive at human speed and the news cache
    // only refreshes every couple of hours, so anything faster is polling for
    // the sake of it.
    const timer = setInterval(load, tickerService.REFRESH_SECONDS * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (items.length < 2) return null;

  /*
   * The list is rendered twice, back to back.
   *
   * The animation slides the track exactly half its width and loops, so the
   * second copy is already in place as the first leaves — a seamless belt
   * rather than a reset that snaps. The duplicate is hidden from assistive
   * technology, which should hear each item once.
   */
  return (
    <div
      className={`ticker${inWorld ? ' ticker--world' : ''}`}
      role="region"
      aria-label="Live activity"
    >
      <div className="ticker__track">
        <TickerRun items={items} />
        <TickerRun items={items} ariaHidden />
      </div>
    </div>
  );
}

function TickerRun({ items, ariaHidden = false }) {
  return (
    <ul className="ticker__run" aria-hidden={ariaHidden || undefined}>
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="ticker__item">
          <span className={`ticker__dot ticker__dot--${item.kind}`} />
          {item.kind === 'news' && item.url ? (
            <a
              className="ticker__text"
              href={item.url}
              target="_blank"
              // `noopener` is the security half; without it the opened page
              // can reach back through `window.opener`.
              rel="noreferrer noopener"
            >
              {item.text}
              {item.source ? <span className="ticker__source">{item.source}</span> : null}
            </a>
          ) : (
            <span className="ticker__text">
              {item.text}
              {item.xp > 0 ? <span className="ticker__xp">+{item.xp} XP</span> : null}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
