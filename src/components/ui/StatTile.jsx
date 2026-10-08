import './ui.css';
import { formatNumber } from '../../utils/format.js';

export function StatTile({ label, value, accent }) {
  return (
    <div className="g-stat">
      <span className="g-stat__value" style={accent ? { color: accent } : undefined}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </span>
      <span className="g-stat__label">{label}</span>
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="g-stat-grid">{children}</div>;
}

/** Generated company tile — no logo files, no trademark risk. */
export function CompanyMark({ name, color = '#6c8cff', size = 'md' }) {
  const monogram = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className={`g-mark${size === 'lg' ? ' g-mark--lg' : ''}`}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
      aria-hidden="true"
    >
      {monogram || '??'}
    </span>
  );
}
