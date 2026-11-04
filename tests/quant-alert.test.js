'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeQuantAlert } = require('../server');

function input(overrides = {}) {
  const technical = {
    atr14: 2,
    volumeRatio: 1,
    ma: { ma20: 99 },
    maBearish: false,
    macd: { hist: 0.2, signal: '金叉' },
    rsi: { rsi6: 58 },
    ...(overrides.technical || {}),
  };
  const flow = {
    historyAvailable: true,
    sum5: 1_000_000,
    today: { main: 200_000 },
    ...(overrides.flow || {}),
  };
  return {
    price: 100,
    composite: 65,
    confidence: 76,
    scoreTechnical: 68,
    scoreCapital: 66,
    technical,
    flow,
    levels: { support: 99, resistance: 106, invalidation: 96 },
    ...overrides,
    technical,
    flow,
  };
}

test('triggers a pullback buy alert when price and confirmations align', () => {
  const alert = computeQuantAlert(input());

  assert.equal(alert.status, 'triggered');
  assert.equal(alert.actionKey, 'buy');
  assert.equal(alert.distancePct, 0);
  assert.ok(alert.metCount >= 3);
  assert.ok(alert.confidence >= 48 && alert.confidence <= 93);
});

test('triggers a sell alert below the quantitative risk line', () => {
  const alert = computeQuantAlert(input({
    price: 90,
    composite: 34,
    scoreTechnical: 31,
    scoreCapital: 28,
    technical: {
      atr14: 2.2,
      volumeRatio: 1.3,
      ma: { ma20: 94 },
      maBearish: true,
      macd: { hist: -0.4, signal: '死叉' },
      rsi: { rsi6: 35 },
    },
    flow: {
      historyAvailable: true,
      sum5: -2_000_000,
      today: { main: -500_000 },
    },
    levels: { support: 88, resistance: 95, invalidation: 86 },
  }));

  assert.equal(alert.status, 'triggered');
  assert.equal(alert.actionKey, 'sell');
  assert.equal(alert.triggerPrice, 94);
  assert.equal(alert.metCount, 4);
});

test('keeps a neutral setup in monitoring state', () => {
  const alert = computeQuantAlert(input({
    composite: 52,
    confidence: 62,
    scoreTechnical: 51,
    scoreCapital: 50,
    technical: {
      atr14: 2,
      volumeRatio: 0.9,
      ma: { ma20: 99 },
      maBearish: false,
      macd: { hist: -0.05, signal: '粘合' },
      rsi: { rsi6: 50 },
    },
    flow: {
      historyAvailable: true,
      sum5: 0,
      today: { main: 0 },
    },
    levels: { support: 95, resistance: 106, invalidation: 92 },
  }));

  assert.equal(alert.status, 'watching');
  assert.equal(alert.actionKey, 'watch');
  assert.ok(alert.distancePct > 0);
});
