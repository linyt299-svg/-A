'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEastmoneyTrends, parseTencentIntraday } = require('../server');

test('normalizes Eastmoney intraday rows and derives change fields', () => {
  const result = parseEastmoneyTrends({
    name: '贵州茅台',
    code: '600519',
    preClose: 1500,
    trends: [
      '2026-11-04 09:30,1500.00,1503.00,1503.00,1500.00,128,19238400,1502.50,15,0.20',
      '2026-11-04 09:31,1503.00,1497.00,1503.00,1497.00,80,11976000,1500.00,12,-0.20',
    ],
  }, '600519');

  assert.equal(result.available, true);
  assert.equal(result.date, '2026-11-04');
  assert.equal(result.preClose, 1500);
  assert.deepEqual(result.rows[0], {
    time: '09:30',
    timestamp: '2026-11-04 09:30',
    price: 1503,
    average: 1502.5,
    volume: 128,
    amount: 19238400,
    change: 3,
    pct: 0.2,
  });
  assert.equal(result.rows[1].pct, -0.2);
});

test('normalizes Tencent minute fallback and calculates average price', () => {
  const result = parseTencentIntraday({
    data: {
      sh600519: {
        data: {
          date: '20261104',
          data: [
            '0930 1503.00 128 19238400',
            '0931 1497.00 208 31214400',
          ],
        },
      },
    },
  }, '600519', 1500);

  assert.equal(result.provider, 'tencent');
  assert.equal(result.date, '2026-11-04');
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].time, '09:30');
  assert.equal(result.rows[0].average, 1503);
  assert.equal(result.rows[1].average, 1500.69);
  assert.equal(result.rows[1].volume, 80);
  assert.equal(result.rows[1].amount, 11976000);
  assert.equal(result.rows[1].pct, -0.2);
});

test('returns an explicit unavailable shape for empty Eastmoney trends', () => {
  const result = parseEastmoneyTrends({ preClose: 12.34, trends: [] }, '000001');

  assert.equal(result.available, false);
  assert.equal(result.date, null);
  assert.deepEqual(result.rows, []);
});
