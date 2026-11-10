'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computePositionAdvice, sanitizeSyncedPosition, runPositionMonitor } = require('../server');

function payload(overrides = {}) {
  return {
    quote: { price: 86, name: '东山精密' },
    technical: {
      atr14: 3.2,
      volumeRatio: 1,
      rsi: { rsi6: 74 },
      macd: { hist: 0.15, prevHist: 0.3, signal: '多头动能' },
    },
    flow: { historyAvailable: true, sum5: 50_000_000, today: { main: -20_000_000 } },
    intraday: {
      rows: [85.7, 85.96, 85.72, 86.05, 85.8, 86].map((price, index) => ({ time: `10:0${index}`, price })),
    },
    news: { score: 52, sentiment: '中性' },
    ai: {
      composite: 57,
      levels: { support: 84.8, resistance: 86.2, invalidation: 82 },
      forecast: { confidence: 72, quant: { positionPct: 35 } },
      quantAlert: { priceAdvice: { sell: { lower: 85.8, upper: 86.2 } } },
    },
    ...overrides,
  };
}

const position = {
  cost: 84.89,
  shares: 1_000,
  capital: 200_000,
  totalBuy: 84_890,
  totalSell: 0,
};

test('takes partial profit near resistance without a fixed 18% threshold', () => {
  const advice = computePositionAdvice(payload(), position);

  assert.equal(advice.action, '压力区 · 分批止盈');
  assert.equal(advice.decision.key, 'pressure-take-profit');
  assert.ok(advice.stats.pnlPct > 1 && advice.stats.pnlPct < 2);
  assert.equal(advice.decision.reduceRatio, 50);
  assert.equal(advice.decision.failedBreakout, true);
  assert.equal(advice.monitorAlert.status, 'triggered');
  assert.match(advice.advice, /先卖出 500 股.*放量站稳 86\.20 元则取消止盈/);
});

test('keeps the position and raises defense after a confirmed breakout', () => {
  const advice = computePositionAdvice(payload({
    quote: { price: 86.35, name: '东山精密' },
    technical: {
      atr14: 3.2,
      volumeRatio: 1.35,
      rsi: { rsi6: 76 },
      macd: { hist: 0.35, prevHist: 0.2, signal: '多头动能' },
    },
    flow: { historyAvailable: true, sum5: 80_000_000, today: { main: 30_000_000 } },
    intraday: { rows: [86.05, 86.22, 86.25, 86.3, 86.35].map((price) => ({ price })) },
  }), position);

  assert.equal(advice.action, '放量突破 · 继续持有');
  assert.equal(advice.decision.breakoutConfirmed, true);
  assert.equal(advice.stats.defense, 85.4);
  assert.equal(advice.monitorAlert.status, 'watching');
  assert.match(advice.advice, /取消本轮止盈/);
});

test('sanitizes positions before they enter background monitoring', () => {
  assert.deepEqual(sanitizeSyncedPosition({
    cost: '84.89',
    shares: '1000',
    capital: '200000',
    totalBuy: '84890',
    totalSell: '0',
    latestSide: 'buy',
    latestAmount: '84890',
  }), {
    cost: 84.89,
    shares: 1000,
    capital: 200000,
    totalBuy: 84890,
    totalSell: 0,
    latestSide: 'buy',
    latestAmount: 84890,
  });
  assert.equal(sanitizeSyncedPosition({ cost: 0, shares: 100 }), null);
});

test('background monitor evaluates synced positions without an open page', async () => {
  const delivered = [];
  const result = await runPositionMonitor({
    force: true,
    positions: [{ userId: 'user-1', code: '002384', ...position }],
    findUserImpl: (id) => ({ id }),
    buildPayloadImpl: async () => payload(),
    recordAlertImpl: async (event) => {
      delivered.push(event);
      return { id: 'position-alert' };
    },
  });

  assert.deepEqual(result, { checked: 1, triggered: 1 });
  assert.equal(delivered[0].alert.scope, 'position');
  assert.equal(delivered[0].alert.status, 'triggered');
  assert.equal(delivered[0].alert.actionKey, 'sell');
});
