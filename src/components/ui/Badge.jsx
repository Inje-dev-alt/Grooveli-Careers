import './ui.css';

export function Badge({ tone = 'default', dot = false, className = '', children, ...rest }) {
  const classes = ['g-badge', tone !== 'default' && `g-badge--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {dot ? <span className="g-badge__dot" /> : null}
      {children}
    </span>
  );
}

/**
 * Match score, coloured by how usable the match actually is. The thresholds
 * mirror `SUITABLE_MATCH_THRESHOLD` so the colour and the XP rule agree.
 */
export function MatchBadge({ score }) {
  const tone = score >= 80 ? 'success' : score >= 60 ? 'accent' : score >= 40 ? 'warning' : 'default';
  return (
    <Badge tone={tone} dot>
      {score}% match
    </Badge>
  );
}
