/**
 * Is it the middle of this person's night?
 *
 * Quiet hours are two hour numbers and a timezone. The numbers mean nothing
 * on their own: "no reminders between 22:00 and 07:00" is a statement about
 * the person's clock, not the server's, and evaluating it in UTC silences
 * someone in Lagos an hour early and someone in Toronto all afternoon.
 *
 * NO LIBRARY. `Intl` carries the IANA zone database in the runtime, so asking
 * it what hour it is somewhere is both exact and free. A date library here
 * would be a dependency, a bundle and a second copy of the rules that the
 * platform already ships and keeps current.
 */

/**
 * The hour of the day, 0-23, right now, in this zone.
 *
 * Falls back to UTC on an unknown zone rather than throwing. A stored zone
 * can become invalid — IANA renames zones, and a client can send anything —
 * and the right answer to "I do not recognise this zone" is to deliver the
 * notification rather than to fail the whole sweep for everybody in it.
 */
export function localHour(timezone: string, now: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const hour = Number.parseInt(formatted, 10);
    // `24` is how some locales render midnight.
    return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
  } catch {
    console.warn(`[quietHours] unknown timezone '${timezone}', falling back to UTC`);
    return now.getUTCHours();
  }
}

/** Is this an IANA zone the runtime recognises? */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Does `hour` fall inside the window from `start` to `end`?
 *
 * The window usually WRAPS MIDNIGHT — 22:00 to 07:00 is the common case and
 * the one a naive `start <= hour && hour < end` gets exactly backwards,
 * silencing the whole working day and nothing of the night.
 *
 * Both ends are half-open: quiet at 22:00, awake again at 07:00.
 */
export function hourIsInWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false; // a zero-length window silences nothing
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export type QuietHours = { start: number; end: number } | null;

/**
 * Should this account be left alone right now?
 *
 * @param quietHours the account's window, or null for none
 * @param timezone   the account's IANA zone
 */
export function inQuietHours(
  quietHours: QuietHours,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!quietHours) return false;
  const { start, end } = quietHours;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  return hourIsInWindow(localHour(timezone, now), start, end);
}
