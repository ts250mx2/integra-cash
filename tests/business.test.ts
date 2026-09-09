import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../lib/db';
import {
  addDays,
  daysBetween,
  integer,
  money,
  quoteInterest,
  renewalDue,
  roundMoney,
} from '../lib/business';

after(() => pool.end());

test('monthly simple interest respects term and never compounds overdue interest', () => {
  assert.equal(quoteInterest(1000, 10, 30, '2026-09-30', '2026-09-01'), 100);
  assert.equal(quoteInterest(1000, 10, 15, '2026-09-30', '2026-09-30'), 50);
  assert.equal(quoteInterest(1000, 10, 30, '2026-09-30', '2026-10-15'), 150);
  assert.equal(quoteInterest(1000, 10, 30, '2026-09-30', '2026-11-29'), 300);
});

test('partial principal payments preserve the term basis; renewal can lower it', () => {
  const contractedBasis = 5000,
    principalAfterPayment = 3000;
  assert.equal(quoteInterest(contractedBasis, 10, 30, '2026-09-30', '2026-09-10'), 500);
  assert.equal(quoteInterest(principalAfterPayment, 10, 30, '2026-10-30', '2026-10-01'), 300);
});

test('interest rounds once to cents and supports a zero rate', () => {
  assert.equal(quoteInterest(1234.56, 7.5, 17, '2026-09-30', '2026-09-30'), 52.47);
  assert.equal(quoteInterest(1234.56, 0, 30, '2026-09-30', '2026-12-30'), 0);
  assert.equal(roundMoney(1.005), 1.01);
});

test('renewal preserves remaining days and starts from today when overdue', () => {
  assert.equal(renewalDue('2026-09-30', 30, '2026-09-10'), '2026-10-30');
  assert.equal(renewalDue('2026-09-30', 30, '2026-10-15'), '2026-11-14');
});

test('calendar arithmetic covers leap days and year changes without DST drift', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 30), '2027-01-30');
  assert.equal(daysBetween('2026-09-30', '2026-10-01'), 1);
  assert.equal(daysBetween('2026-10-01', '2026-09-30'), -1);
});

test('money rejects malformed, non-finite, negative, and excess decimal values', () => {
  for (const value of [undefined, null, true, [], {}, '', '   ', 'abc', Infinity, NaN, -1, 1.001])
    assert.throws(() => money(value, 'Importe'));
  assert.equal(money('123.45', 'Importe'), 123.45);
  assert.equal(money(0, 'Fondo'), 0);
  assert.throws(() => money(0, 'Capital', 0.01));
  assert.throws(() => money(101, 'Tasa', 0, 100));
});

test('IDs and terms require bounded safe integers', () => {
  for (const value of [
    undefined,
    null,
    true,
    '',
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    'invalid',
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => integer(value));
  assert.equal(integer('42'), 42);
  assert.equal(integer(0, 'Gracia', 0, 365), 0);
  assert.throws(() => integer(366, 'Plazo', 1, 365));
});
