'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalize,
  WEAK_CONCLUSION_TITLE,
  WEAK_CONCLUSION_NOTE,
} = require('../public/presentation-logic');

function conflictPayload(overrides = {}) {
  return {
    price: 89,
    ai: { stance: '中性观望' },
    technical: { macd: { hist: -0.2 } },
    flow: {
      historyAvailable: true,
      sum5: -120_000_000,
      today: { main: -30_000_000 },
    },
    alert: {
      actionKey: 'watch',
      conditions: [
        { label: 'MACD 动能偏多', met: false },
        { label: '主力资金净流入', met: false },
      ],
      rules: [
        { key: 'left', label: '左侧条件', status: 'armed', text: '放量突破 103.76 元后买入' },
      ],
      priceAdvice: {
        buy: { lower: 84, upper: 86, breakoutPrice: null },
        sell: { lower: 100, upper: 104, riskPrice: 103.76 },
      },
    },
    ...overrides,
  };
}

test('reclassifies an overhead defense price and removes the false stop', () => {
  const view = normalize(conflictPayload());

  assert.deepEqual(view.risk, {
    visible: true,
    kind: 'overhead',
    label: '上方阻力预警',
    value: 103.76,
  });
  assert.equal(view.alert.priceAdvice.sell.riskPrice, null);
  assert.equal(view.alert.priceAdvice.buy.breakoutPrice, null);
});

test('downgrades a contradictory buy order to extreme breakout observation', () => {
  const view = normalize(conflictPayload());
  const leftRule = view.alert.rules.find((rule) => rule.key === 'left');

  assert.equal(leftRule.label, '极端突破观察');
  assert.equal(leftRule.status, 'observe');
  assert.equal(leftRule.text, '若放量突破 103.76，仅作趋势跟踪，不建议盲目追高');
});

test('adds the requested weak-market conclusion when momentum and capital both fail', () => {
  const view = normalize(conflictPayload());

  assert.equal(view.conclusion.title, WEAK_CONCLUSION_TITLE);
  assert.equal(view.conclusion.note, WEAK_CONCLUSION_NOTE);
});

test('keeps a valid downside defense price unchanged', () => {
  const payload = conflictPayload();
  payload.alert.priceAdvice.buy.breakoutPrice = 96;
  payload.alert.priceAdvice.sell.riskPrice = 82;
  payload.technical.macd.hist = 0.3;
  payload.alert.conditions[0].met = true;
  const view = normalize(payload);

  assert.deepEqual(view.risk, {
    visible: true,
    kind: 'defense',
    label: '风险防守位',
    value: 82,
  });
  assert.equal(view.alert.priceAdvice.sell.riskPrice, 82);
  assert.equal(view.conclusion.title, '');
});

test('hides the defense module when no usable risk level exists', () => {
  const payload = conflictPayload();
  payload.alert.priceAdvice.sell.riskPrice = null;
  const view = normalize(payload);

  assert.equal(view.risk.visible, false);
  assert.equal(view.risk.kind, 'hidden');
});
