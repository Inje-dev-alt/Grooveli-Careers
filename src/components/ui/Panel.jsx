import './ui.css';

/** Generic surface. `as="button"` turns it into an interactive card. */
export function Panel({
  as: Tag = 'div',
  glass = false,
  pad = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'g-panel',
    glass && 'g-panel--glass',
    pad === 'md' && 'g-panel--pad',
    pad === 'sm' && 'g-panel--pad-sm',
    interactive && 'g-panel--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="g-panel__header">
      <div>
        <h3 className="g-panel__title">{title}</h3>
        {subtitle ? <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
