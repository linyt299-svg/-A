'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWatchlistItem } = require('../server');

test('keeps a watchlist quote when the mini chart provider fails', async () => {
  const item = await buildWatchlistItem('600519', {
    loadQuote: async () => ({
      name: '贵州茅台',
      price: 1500,
      changePct: 1.25,
      change: 18.52,
      market: 'SH',
    }),
    loadKline: async () => { throw new Error('kline unavailable'); },
    loadSnapshot: async () => null,
  });

  assert.equal(item.code, '600519');
  assert.equal(item.name, '贵州茅台');
  assert.equal(item.price, 1500);
  assert.deepEqual(item.spark, []);
  assert.equal(item.available, true);
  assert.equal(item.stale, false);
});

test('falls back to the latest stock snapshot when live providers fail', async () => {
  const item = await buildWatchlistItem('300750', {
    loadQuote: async () => { throw new Error('quote unavailable'); },
    loadKline: async () => { throw new Error('kline unavailable'); },
    loadSnapshot: async () => ({
      quote: { name: '宁德时代', price: 420.5, changePct: -0.8, change: -3.39, market: 'SZ' },
      kline: { rows: [{ close: 418 }, { close: 420.5 }] },
    }),
  });

  assert.equal(item.name, '宁德时代');
  assert.equal(item.price, 420.5);
  assert.deepEqual(item.spark, [418, 420.5]);
  assert.equal(item.available, true);
  assert.equal(item.stale, true);
});

test('returns a visible placeholder instead of dropping a saved symbol', async () => {
  const item = await buildWatchlistItem('000001', {
    loadQuote: async () => { throw new Error('quote unavailable'); },
    loadKline: async () => { throw new Error('kline unavailable'); },
    loadSnapshot: async () => null,
  });

  assert.equal(item.code, '000001');
  assert.equal(item.name, '000001');
  assert.equal(item.price, null);
  assert.equal(item.changePct, null);
  assert.equal(item.market, 'SZ');
  assert.deepEqual(item.spark, []);
  assert.equal(item.available, false);
});
