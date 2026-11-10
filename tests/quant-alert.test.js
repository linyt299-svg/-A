'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeAi, computeQuantAlert } = require('../server');

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
  assert.ok(alert.priceAdvice.buy.lower <= alert.priceAdvice.buy.upper);
  assert.ok(alert.priceAdvice.sell.lower <= alert.priceAdvice.sell.upper);
  assert.ok(alert.priceAdvice.buy.upper < alert.priceAdvice.sell.lower);
  assert.match(alert.priceAdvice.basis, /支撑/);
  assert.match(alert.priceAdvice.disclaimer, /不构成投资建议|收益保证/);
});

test('triggers a sell alert below the quantitative risk line', () => {
  const alert = computeQuantAlert(input({
    price: 83,
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
    levels: { support: 84, resistance: 95, invalidation: 82 },
  }));

  assert.equal(alert.status, 'triggered');
  assert.equal(alert.actionKey, 'sell');
  assert.equal(alert.triggerPrice, 83.58);
  assert.equal(alert.metCount, 4);
  assert.ok(alert.priceAdvice.sell.riskPrice > 0);
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

test('does not treat a five-day inflow as bullish confirmation after a fresh outflow', () => {
  const alert = computeQuantAlert(input({
    price: 84,
    composite: 62,
    scoreTechnical: 67,
    scoreCapital: 53,
    technical: {
      atr14: 3.8,
      volumeRatio: 1.1,
      ma: { ma20: 80 },
      maBearish: false,
      macd: { hist: 0.3, signal: '金叉' },
      rsi: { rsi6: 36 },
    },
    flow: {
      historyAvailable: true,
      sum5: 119_000_000,
      today: { main: -1_390_000_000 },
    },
    levels: { support: 78, resistance: 89.59, invalidation: 76.5 },
  }));

  assert.equal(alert.status, 'watching');
  assert.equal(alert.actionKey, 'watch');
  assert.equal(alert.tone, 'warn');
  assert.match(alert.summary, /资金方向背离|资金转正/);
  assert.equal(alert.conditions.find((item) => item.label.includes('资金方向一致')).met, false);
  assert.equal(alert.priceAdvice.buy.mode, 'observe');
  assert.equal(alert.rules.find((item) => item.key === 'left').status, 'observe');
  assert.match(alert.rules.find((item) => item.key === 'right').text, /89\.59.*资金净流入/);
  assert.ok(alert.priceAdvice.buy.upper < alert.priceAdvice.sell.lower);
  assert.equal(alert.priceAdvice.buy.breakoutPrice, 89.59);
  assert.equal(alert.priceAdvice.sell.upper, 89.59);
  assert.doesNotMatch(alert.rule, /103\.80/);
});

test('keeps price zones disjoint even when ATR buffers are wider than the range', () => {
  const alert = computeQuantAlert(input({
    technical: {
      atr14: 20,
      volumeRatio: 1,
      ma: { ma20: 99 },
      maBearish: false,
      macd: { hist: 0.2, signal: '金叉' },
      rsi: { rsi6: 58 },
    },
    levels: { support: 98, resistance: 102, invalidation: 96 },
  }));

  assert.ok(alert.priceAdvice.buy.upper < alert.priceAdvice.sell.lower);
});

test('does not use an MA20 above the trading range as a downside trigger', () => {
  const alert = computeQuantAlert(input({
    price: 85.14,
    composite: 48,
    confidence: 73,
    scoreTechnical: 32,
    scoreCapital: 36,
    technical: {
      atr14: 8.95,
      volumeRatio: 0.51,
      ma: { ma20: 103.8 },
      maBearish: false,
      macd: { hist: 1.167, signal: '金叉' },
      rsi: { rsi6: 36.47 },
    },
    flow: {
      historyAvailable: true,
      sum5: -2_692_013_056,
      today: { main: 679_728_628 },
    },
    levels: { support: 78, resistance: 89.59, invalidation: 72.63 },
  }));

  assert.equal(alert.triggerPrice, 77.61);
  assert.equal(alert.priceAdvice.sell.riskPrice, 77.61);
  assert.ok(alert.priceAdvice.sell.riskPrice < alert.priceAdvice.buy.lower);
  assert.match(alert.rule, /89\.59/);
  assert.doesNotMatch(alert.rule, /103\.80/);
});

test('requires positive capital confirmation before any long alert can trigger', () => {
  const alert = computeQuantAlert(input({
    price: 79,
    composite: 68,
    scoreTechnical: 72,
    scoreCapital: 42,
    technical: {
      atr14: 3.8,
      volumeRatio: 1.4,
      ma: { ma20: 103.8 },
      maBearish: false,
      macd: { hist: 0.3, signal: '金叉' },
      rsi: { rsi6: 36 },
    },
    flow: {
      historyAvailable: true,
      sum5: 119_000_000,
      today: { main: -1_390_000_000 },
    },
    levels: { support: 78, resistance: 89.59, invalidation: 72.63 },
  }));

  assert.equal(alert.status, 'watching');
  assert.equal(alert.actionKey, 'watch');
  assert.equal(alert.priceAdvice.buy.mode, 'observe');
});

test('does not trigger a pullback buy after price falls below the observation zone', () => {
  const alert = computeQuantAlert(input({
    price: 77.8,
    composite: 68,
    scoreTechnical: 72,
    scoreCapital: 66,
    technical: {
      atr14: 3.8,
      volumeRatio: 1.1,
      ma: { ma20: 80 },
      maBearish: false,
      macd: { hist: 0.3, signal: '金叉' },
      rsi: { rsi6: 36 },
    },
    flow: {
      historyAvailable: true,
      sum5: 119_000_000,
      today: { main: 39_000_000 },
    },
    levels: { support: 78, resistance: 89.59, invalidation: 72.63 },
  }));

  assert.equal(alert.status, 'watching');
  assert.equal(alert.actionKey, 'watch');
});

test('forces defense below the risk price without waiting for three bearish confirmations', () => {
  const alert = computeQuantAlert(input({
    price: 77.5,
    composite: 58,
    scoreTechnical: 58,
    scoreCapital: 55,
    technical: {
      atr14: 3.8,
      volumeRatio: 0.9,
      ma: { ma20: 80 },
      maBearish: false,
      macd: { hist: 0.1, signal: '粘合' },
      rsi: { rsi6: 45 },
    },
    flow: {
      historyAvailable: true,
      sum5: 119_000_000,
      today: { main: 39_000_000 },
    },
    levels: { support: 78, resistance: 89.59, invalidation: 72.63 },
  }));

  assert.equal(alert.status, 'triggered');
  assert.equal(alert.actionKey, 'sell');
  assert.ok(alert.metCount < 3);
});

test('recomputes the reported conflict snapshot without leaking MA20 into trade levels', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/snapshots/002384.json'), 'utf8'));
  const ai = computeAi({
    quote: snapshot.quote,
    technical: snapshot.technical,
    flow: snapshot.flow,
    reports: snapshot.reports,
    markets: snapshot.markets,
    rows: snapshot.kline.rows,
    news: snapshot.news,
  });

  assert.equal(ai.conclusions.ai.title, '技术修复但资金未共振，暂观望');
  assert.match(ai.conclusions.ai.text, /MACD 金叉.*资金面与技术面未形成共振/);
  assert.equal(ai.quantAlert.priceAdvice.buy.breakoutPrice, 85.76);
  assert.equal(ai.quantAlert.priceAdvice.sell.riskPrice, 77.61);
  assert.equal(ai.quantAlert.priceAdvice.buy.mode, 'observe');
  assert.doesNotMatch(ai.quantAlert.rule, /103\.76/);
});

test('buy and sell simulations both expose deliverable alert payloads', () => {
  const buy = computeQuantAlert(input());
  const sell = computeQuantAlert(input({
    price: 83,
    composite: 34,
    scoreTechnical: 31,
    scoreCapital: 28,
    technical: { atr14: 2.2, volumeRatio: 1.3, ma: { ma20: 94 }, maBearish: true, macd: { hist: -0.4, signal: '死叉' }, rsi: { rsi6: 35 } },
    flow: { historyAvailable: true, sum5: -2_000_000, today: { main: -500_000 } },
    levels: { support: 84, resistance: 95, invalidation: 82 },
  }));
  for (const [side, alert] of [['buy', buy], ['sell', sell]]) {
    assert.equal(alert.status, 'triggered');
    assert.equal(alert.actionKey, side);
    assert.ok(alert.title);
    assert.ok(alert.summary);
    assert.ok(alert.triggerPrice > 0);
    assert.ok(alert.rule);
  }
});
