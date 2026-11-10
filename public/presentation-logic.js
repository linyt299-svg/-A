(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StockLensPresentation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEAK_CONCLUSION_TITLE = '弱势震荡，观望为主，支撑位附近可轻仓左侧试错';
  const WEAK_CONCLUSION_NOTE = '技术指标与资金面背离，反弹高度存疑';

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function failedCondition(conditions, pattern) {
    return conditions.some((condition) => (
      condition
      && condition.met === false
      && pattern.test(String(condition.label || ''))
    ));
  }

  function normalize(input = {}) {
    const sourceAlert = input.alert || {};
    const sourceAdvice = sourceAlert.priceAdvice || {};
    const sourceBuy = sourceAdvice.buy || {};
    const sourceSell = sourceAdvice.sell || {};
    const price = positiveNumber(input.price || sourceAlert.currentPrice);
    const riskPrice = positiveNumber(sourceSell.riskPrice);
    const breakoutPrice = positiveNumber(sourceBuy.breakoutPrice);
    const overheadRisk = Boolean(price && riskPrice && riskPrice >= price);
    const validDefense = Boolean(riskPrice && (!price || riskPrice < price));
    const conditions = Array.isArray(sourceAlert.conditions) ? sourceAlert.conditions : [];
    let rules = Array.isArray(sourceAlert.rules)
      ? sourceAlert.rules.map((rule) => ({ ...rule }))
      : [];

    const buy = { ...sourceBuy };
    const sell = { ...sourceSell };
    let risk = {
      visible: validDefense,
      kind: validDefense ? 'defense' : 'hidden',
      label: '风险防守位',
      value: validDefense ? riskPrice : null,
    };

    if (overheadRisk) {
      sell.riskPrice = null;
      sell.condition = '未能计算有效下方防守位，原价位仅作为上方阻力观察。';
      risk = {
        visible: true,
        kind: 'overhead',
        label: '上方阻力预警',
        value: riskPrice,
      };

      if (!breakoutPrice) {
        const extremeText = `若放量突破 ${riskPrice.toFixed(2)}，仅作趋势跟踪，不建议盲目追高`;
        const leftRuleIndex = rules.findIndex((rule) => rule && rule.key === 'left');
        const extremeRule = {
          key: 'left',
          label: '极端突破观察',
          status: 'observe',
          text: extremeText,
        };
        if (leftRuleIndex >= 0) rules[leftRuleIndex] = extremeRule;
        else rules.unshift(extremeRule);
      }
    } else if (!validDefense) {
      sell.riskPrice = null;
      sell.condition = '暂未计算出有效的下方防守位。';
    }

    const alert = {
      ...sourceAlert,
      rules,
      priceAdvice: {
        ...sourceAdvice,
        buy,
        sell,
      },
    };

    const flow = input.flow || {};
    const todayMain = Number(flow.today && flow.today.main);
    const sum5 = Number(flow.sum5);
    const macdWeak = failedCondition(conditions, /MACD/i)
      || Number(input.technical && input.technical.macd && input.technical.macd.hist) < 0;
    const capitalWeak = failedCondition(conditions, /主力资金|资金方向|资金净流入/)
      || conditions.some((condition) => (
        condition
        && condition.met === true
        && /主力资金.*净流出|资金.*流出/.test(String(condition.label || ''))
      ))
      || (Number.isFinite(todayMain) && todayMain < 0)
      || (flow.historyAvailable && Number.isFinite(sum5) && sum5 < 0);
    const isWatching = sourceAlert.actionKey === 'watch'
      || /观望/.test(String(input.ai && input.ai.stance || ''));
    const weakConflict = isWatching && macdWeak && capitalWeak;

    return {
      alert,
      risk,
      conclusion: weakConflict
        ? { title: WEAK_CONCLUSION_TITLE, note: WEAK_CONCLUSION_NOTE }
        : { title: '', note: '' },
    };
  }

  return {
    normalize,
    WEAK_CONCLUSION_TITLE,
    WEAK_CONCLUSION_NOTE,
  };
}));
