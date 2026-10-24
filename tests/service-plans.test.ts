import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPeriod, servicePlan, serviceFeatures } from '../src/lib/service-plans';
import { businessHoursSchema, withinBusinessHours } from '../src/lib/business-hours';
import { csvCell } from '../src/lib/recommendations';
test('free monthly periods clamp month-end without drifting the next anniversary', () => {
  const anchor = new Date('2024-01-31T10:20:00Z');
  const before = monthlyPeriod(anchor, new Date('2024-02-29T10:19:59Z'));
  assert.equal(before.start.toISOString(), '2024-01-31T10:20:00.000Z');
  assert.equal(before.end.toISOString(), '2024-02-29T10:20:00.000Z');
  const next = monthlyPeriod(anchor, new Date('2024-02-29T10:20:00Z'));
  assert.equal(next.start.toISOString(), '2024-02-29T10:20:00.000Z');
  assert.equal(next.end.toISOString(), '2024-03-31T10:20:00.000Z');
  const ordinary = monthlyPeriod(
    new Date('2025-01-31T00:00:00Z'),
    new Date('2025-02-28T00:00:00Z'),
  );
  assert.equal(ordinary.end.toISOString(), '2025-03-31T00:00:00.000Z');
  assert.throws(() => monthlyPeriod(new Date('invalid')));
  assert.throws(() => monthlyPeriod(new Date('2030-01-01'), new Date('2026-01-01')));
});
test('free plan cannot imply a charge or advertise future capabilities as active', () => {
  assert.equal(servicePlan.priceToman, 0);
  assert.equal(servicePlan.automaticCharging, false);
  assert.equal(servicePlan.paymentEnabled, false);
  assert.equal(serviceFeatures.find((f) => f.title === 'توسعه وب‌سایت')?.state, 'soon');
  assert.equal(new Set(serviceFeatures.map((f) => f.title)).size, serviceFeatures.length);
  assert.equal(csvCell('  =HYPERLINK("https://invalid")').startsWith('"\''), true);
});
test('Tehran business hours have inclusive start, exclusive end and correct weekday', () => {
  const hours = businessHoursSchema.parse({
    enabled: true,
    days: [6],
    start: '09:00',
    end: '18:00',
  });
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T05:29:59Z')), false);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T05:30:00Z')), true);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T14:30:00Z')), false);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-25T06:00:00Z')), false);
  assert.equal(
    withinBusinessHours({ ...hours, enabled: false }, new Date('2026-10-25T06:00:00Z')),
    true,
  );
});
test('overnight hours belong to the preceding selected day; invalid schedules are rejected', () => {
  const hours = businessHoursSchema.parse({
    enabled: true,
    days: [6],
    start: '22:00',
    end: '02:00',
  });
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T18:30:00Z')), true);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T21:30:00Z')), true);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-24T22:30:00Z')), false);
  assert.equal(withinBusinessHours(hours, new Date('2026-10-25T18:30:00Z')), false);
  assert.equal(
    businessHoursSchema.safeParse({ enabled: true, days: [], start: '09:00', end: '18:00' })
      .success,
    false,
  );
  assert.equal(
    businessHoursSchema.safeParse({ enabled: true, days: [6, 6], start: '09:00', end: '18:00' })
      .success,
    false,
  );
  assert.equal(
    businessHoursSchema.safeParse({ enabled: true, start: '09:00', end: '09:00' }).success,
    false,
  );
});
