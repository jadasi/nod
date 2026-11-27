/**
 * Open hours are 8:00-20:00 America/Phoenix (settled in docs/HANDOFF.md).
 * Arizona does not observe DST, so Phoenix is a fixed UTC-7 offset; no Intl
 * dependency, exact for every date.
 */
export const PHOENIX_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;

/** Local Phoenix hour (0-23) for a UTC timestamp. */
export function phoenixHour(nowMs: number): number {
  // Phoenix is west of UTC (UTC-7), so local time lags UTC.
  const h = Math.floor((nowMs - PHOENIX_UTC_OFFSET_MS) / 3_600_000) % 24;
  return h < 0 ? h + 24 : h;
}

/** Inside open hours (8am-8pm Phoenix)? */
export function isOpenNow(nowMs: number): boolean {
  const h = phoenixHour(nowMs);
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

/** The quiet-hours strip text, or null when in open hours. */
export function quietHoursLine(nowMs: number): string | null {
  if (isOpenNow(nowMs)) return null;
  return 'Quiet hours until 8:00 am. Only urgent decisions alert you.';
}

/** The Call Me availability line (phase 1 shows it in place of the feature). */
export function callAvailability(nowMs: number): string | null {
  return isOpenNow(nowMs) ? null : 'Calls are open 8:00 am – 8:00 pm';
}
