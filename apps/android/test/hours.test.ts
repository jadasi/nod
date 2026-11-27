import { describe, expect, it } from 'vitest';
import { callAvailability, isOpenNow, phoenixHour, quietHoursLine } from '@/lib/hours.js';

// Phoenix is a fixed UTC-7 (no DST). Open hours are 8:00-20:00 Phoenix.
const UTC = (day: number, h: number, m = 0): number => Date.UTC(2026, 0, 15 + day, h, m);

describe('phoenixHour', () => {
  it('converts UTC to Phoenix local hour', () => {
    expect(phoenixHour(UTC(0, 7))).toBe(0);
    expect(phoenixHour(UTC(0, 15, 30))).toBe(8);
    expect(phoenixHour(UTC(0, 23))).toBe(16);
    expect(phoenixHour(UTC(1, 2, 59))).toBe(19);
  });
});

describe('isOpenNow', () => {
  it('opens at 8:00 and closes at 20:00 Phoenix', () => {
    expect(isOpenNow(UTC(0, 14, 59))).toBe(false); // 7:59 Phoenix
    expect(isOpenNow(UTC(0, 15, 0))).toBe(true); // 8:00 Phoenix
    expect(isOpenNow(UTC(0, 2, 59))).toBe(true); // 19:59 Phoenix (next-day UTC)
    expect(isOpenNow(UTC(0, 3, 0))).toBe(false); // 20:00 Phoenix
  });
});

describe('quietHoursLine / callAvailability', () => {
  it('only shows outside open hours', () => {
    expect(quietHoursLine(UTC(0, 16))).toBeNull(); // 9:00 Phoenix
    expect(callAvailability(UTC(0, 16))).toBeNull();
    const night = UTC(0, 12); // 5:00 Phoenix
    expect(quietHoursLine(night)).toBe(
      'Quiet hours until 8:00 am. Only urgent decisions alert you.',
    );
    expect(callAvailability(night)).toBe('Calls are open 8:00 am – 8:00 pm');
  });
});
