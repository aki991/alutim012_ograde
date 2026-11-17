import { describe, expect, it } from 'vitest';
import { afterClear, NOTIFICATIONS_CLEARED_DEFAULT } from '../hooks/useFieldSpecs';

describe('obrisana obaveštenja (specifikacije sa terena)', () => {
  it('probna obaveštenja pristigla do brisanja se ne prikazuju, novija da', () => {
    expect(afterClear('2026-11-10T10:00:00Z', undefined)).toBe(false);
    expect(afterClear(NOTIFICATIONS_CLEARED_DEFAULT, undefined)).toBe(false);
    expect(afterClear('2026-11-18T08:00:00+01:00', undefined)).toBe(true);
  });
  it('„Obriši sva“ pomera granicu', () => {
    const cleared = '2026-12-01T12:00:00Z';
    expect(afterClear('2026-11-20T08:00:00Z', cleared)).toBe(false);
    expect(afterClear('2026-12-01T12:00:01Z', cleared)).toBe(true);
  });
});
