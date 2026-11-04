'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSinaQuote, parseSinaKline } = require('../server');

test('normalizes Sina quote fallback into the stock payload shape', () => {
  const quote = parseSinaQuote(
    'var hq_str_sh600519="贵州茅台,1470.000,1480.000,1446.020,1480.600,1439.000,1446.010,1446.020,6021062,8781130141.000";',
    '600519',
  );

  assert.equal(quote.provider, 'sina');
  assert.equal(quote.name, '贵州茅台');
  assert.equal(quote.price, 1446.02);
  assert.equal(quote.change, -33.98);
  assert.equal(quote.changePct, -2.3);
  assert.equal(quote.volume, 60211);
  assert.equal(quote.amount, 8781130141);
});

test('normalizes Sina daily rows and recomputes day-over-day changes', () => {
  const kline = parseSinaKline({
    result: {
      data: [
        { day: '2026-10-21', open: '10.00', high: '10.30', low: '9.90', close: '10.20', volume: '100000' },
        { day: '2026-10-22', open: '10.20', high: '10.50', low: '10.10', close: '10.40', volume: '120000' },
        { day: '2026-10-23', open: '10.40', high: '10.60', low: '10.20', close: '10.30', volume: '90000' },
        { day: '2026-10-26', open: '10.30', high: '10.80', low: '10.30', close: '10.70', volume: '150000' },
        { day: '2026-10-27', open: '10.70', high: '11.00', low: '10.60', close: '10.90', volume: '180000' },
      ],
    },
  }, '600519');

  assert.equal(kline.provider, 'sina');
  assert.equal(kline.rows.length, 5);
  assert.equal(kline.rows[0].volume, 1000);
  assert.equal(kline.rows[1].change, 0.2);
  assert.equal(kline.rows[1].pct, 1.96);
  assert.equal(kline.preKPrice, 10.7);
});
