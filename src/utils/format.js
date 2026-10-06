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

/** @param {{ min:number, max:number, currency:string, period:string }} salary */
export function formatSalaryRange(salary) {
  if (!salary) return 'Not disclosed';
  const { min, max, currency, period } = salary;
  const suffix = period === 'month' ? '/mo' : '/yr';
  return `${formatCompactMoney(min, currency)} – ${formatCompactMoney(max, currency)}${suffix}`;
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
