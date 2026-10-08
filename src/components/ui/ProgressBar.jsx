import './ui.css';
import { clamp } from '../../utils/format.js';

/** @param {{ value: number, max?: number, size?: 'sm'|'md'|'lg', tone?: string, label?: string }} props */
export function ProgressBar({ value, max = 100, size = 'md', tone = 'accent', label }) {
  const pct = clamp((value / (max || 1)) * 100, 0, 100);
  return (
    <div
      className={`g-progress${size !== 'md' ? ` g-progress--${size}` : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`g-progress__fill${tone !== 'accent' ? ` g-progress__fill--${tone}` : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Labelled meter used for skills and statistics. */
export function Meter({ label, value, max = 100, suffix = '', tone = 'accent', hint }) {
  return (
    <div className="g-meter">
      <div className="g-meter__head">
        <span className="g-meter__label">{label}</span>
        <span className="g-meter__value">
          {value}
          {suffix}
        </span>
      </div>
      <ProgressBar value={value} max={max} size="sm" tone={tone} label={label} />
      {hint ? <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{hint}</span> : null}
    </div>
  );
}
