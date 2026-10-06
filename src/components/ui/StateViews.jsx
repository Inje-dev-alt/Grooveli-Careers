import './ui.css';
import { Button } from './Button.jsx';
import { IconAlert, IconInbox } from './icons.jsx';

/**
 * Loading, empty and error states.
 *
 * Shipped as named components so that every list in the app shows the same
 * thing in the same situation, and so that "did we handle empty?" is a question
 * with a visible answer.
 */

export function LoadingState({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="g-stack" aria-busy="true" aria-live="polite">
      <span className="g-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="g-skeleton g-skeleton-card" />
      ))}
    </div>
  );
}

export function InlineLoading({ label = 'Loading…' }) {
  return (
    <div className="g-state" aria-busy="true">
      <span className="g-spinner" />
      <p className="g-state__body">{label}</p>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', body, icon, action }) {
  return (
    <div className="g-state">
      <span className="g-state__icon">{icon ?? <IconInbox size={22} />}</span>
      <h3 className="g-state__title">{title}</h3>
      {body ? <p className="g-state__body">{body}</p> : null}
      {action}
    </div>
  );
}

/**
 * @param {{ error?: Error, onRetry?: () => void, title?: string }} props
 */
export function ErrorState({ error, onRetry, title = 'That did not load' }) {
  return (
    <div className="g-state g-state--error" role="alert">
      <span className="g-state__icon">
        <IconAlert size={22} />
      </span>
      <h3 className="g-state__title">{title}</h3>
      <p className="g-state__body">
        {error?.message || 'Something went wrong on our side. Nothing you did caused this.'}
      </p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Renders the right state for an async result, so screens stop re-implementing
 * the same three branches.
 *
 * @param {{ query: ReturnType<typeof import('../../hooks/useAsync.js').useAsync>, children: (data:any)=>React.ReactNode }} props
 */
export function AsyncBoundary({ query, loading, empty, errorTitle, children }) {
  if (query.isLoading) return loading ?? <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} title={errorTitle} />;
  if (query.isEmpty) return empty ?? <EmptyState />;
  return children(query.data);
}
