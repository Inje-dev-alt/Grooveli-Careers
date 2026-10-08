/** Presentation helpers. Pure, no state, safe to call during render. */

const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };

/** Compact money: 500000 -> "₦500k", 1400000 -> "₦1.4m" */
export function formatCompactMoney(amount, currency = 'NGN') {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  if (!Number.isFinite(amount)) return '—';
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${symbol}${m % 1 === 0 ? m : m.toFixed(1)}m`;
  }
  if (amount >= 1000) return `${symbol}${Math.round(amount / 1000)}k`;
  return `${symbol}${amount}`;
}

/**
 * Salary is stored flat on the Job, so this takes the job (or anything with the
 * same four fields) rather than a nested object.
 * @param {{ salaryMin:number, salaryMax:number, currency:string, salaryPeriod?:string }} job
 */
export function formatSalaryRange(job) {
  if (!job || (!job.salaryMin && !job.salaryMax)) return 'Not disclosed';
  const { salaryMin, salaryMax, currency, salaryPeriod } = job;
  const suffix = salaryPeriod === 'year' ? '/yr' : '/mo';
  return `${formatCompactMoney(salaryMin, currency)} – ${formatCompactMoney(salaryMax, currency)}${suffix}`;
}

/** "in 12 days" / "closed" for an application deadline. */
export function formatDeadline(isoString) {
  if (!isoString) return null;
  const days = Math.ceil((new Date(isoString).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 30) return `Closes in ${days} days`;
  return null;
}

export function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
}

/** "3 days ago", "just now" — relative to now, for feeds and job lists. */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  if (abs < 60) return 'just now';
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (abs >= seconds) return formatter.format(Math.round(diffSeconds / seconds), unit);
  }
  return 'just now';
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function titleCase(value = '') {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** Two-letter monogram used by the generated company tiles. */
export function initials(name = '') {
  const parts = name.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
