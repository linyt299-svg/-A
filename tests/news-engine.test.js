'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { filterNewsForStock, normalizeNewsPayload, reliabilityWeight, scoreNews, timeDecay } = require('../news-engine');

test('time decay halves after 24 hours', () => {
  const now = new Date('2026-11-02T12:00:00+08:00');
  assert.equal(timeDecay('2026-11-02T12:00:00+08:00', now), 1);
  assert.equal(timeDecay('2026-11-01T12:00:00+08:00', now), 0.5);
});

test('unverified bullish self-media rumor receives negative reliability', () => {
  assert.equal(reliabilityWeight({ source: '市场自媒体', verified: false, impact_score: 80 }), -0.2);
});

test('authoritative positive news outranks an unverified rumor', () => {
  const now = new Date('2026-11-02T12:00:00+08:00');
  const result = scoreNews([
    { id: 'a', source: '上海证券交易所公告', publish_time: '2026-11-02T10:00:00+08:00', impact_score: 80, verified: true },
    { id: 'b', source: '市场自媒体', publish_time: '2026-11-02T11:00:00+08:00', impact_score: 90, verified: false },
  ], { now });
  assert.ok(result.score > 50);
  assert.ok(result.items.find((item) => item.id === 'b').anti_rumor_flag);
});

test('normalizes Tonghuashun important-news payload and infers market impact', () => {
  const rows = normalizeNewsPayload({
    data: {
      list: [{
        id: '5545633',
        title: '迈威尔科技将通过换股交易收购Lumentum',
        digest: '本次交易将整合互补的电、光技术，满足下一代AI数据中心需求。',
        ctime: '1793621220',
        import: '3',
        stock: [{ name: '迈威尔科技', stockCode: 'MRVL' }],
        field: [],
        url: 'https://news.10jqka.com.cn/example.shtml',
      }],
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, '同花顺重要快讯');
  assert.equal(rows[0].importance, 3);
  assert.ok(rows[0].impact_score > 0);
  assert.ok(rows[0].related_sectors.includes('光通信'));
  assert.deepEqual(
    rows[0].related_stocks.find((stock) => stock.code === '002384'),
    {
      code: '002384',
      name: '东山精密',
      relation_type: 'indirect',
      confidence: 0.55,
      relation_reason: '公司布局高速通信 PCB 等精密制造；电光融合并购可能抬升产业链预期，但尚无该交易带来新增订单的确认。',
    },
  );

  const stockNews = filterNewsForStock(rows, '002384');
  assert.equal(stockNews.length, 1);
  assert.equal(stockNews[0].relation_adjusted, true);
  assert.equal(stockNews[0].impact_score, 30.25);
  assert.equal(stockNews[0].market_impact_score, 55);
});
