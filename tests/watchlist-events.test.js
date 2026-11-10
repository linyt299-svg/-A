'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWatchlistEvents, classifyAnnouncement, publishedAt } = require('../watchlist-events');

test('recognizes repurchase cancellation as a positive announcement', () => {
  const result = classifyAnnouncement('关于注销已回购股份暨股份变动的公告');
  assert.equal(result.type, '股份回购注销');
  assert.ok(result.score >= 80);
});

test('excludes negative or routine volatility announcements', () => {
  assert.equal(classifyAnnouncement('关于终止回购公司股份的公告'), null);
  assert.equal(classifyAnnouncement('股票交易异常波动及风险提示公告'), null);
  assert.equal(classifyAnnouncement('股东减持股份计划公告'), null);
});

test('builds fresh direct watchlist events and ignores indirect or stale news', () => {
  const now = new Date('2026-11-10T10:00:00+08:00');
  const items = buildWatchlistEvents({
    codes: ['002384'],
    now,
    newsFeed: [
      {
        id: 'direct',
        title: '东山精密获得重要客户订单',
        publish_time: '2026-11-10T09:30:00+08:00',
        source: '证券时报',
        impact_score: 55,
        verified: true,
        related_stocks: [{ code: '002384', name: '东山精密', relation_type: 'direct' }],
      },
      {
        id: 'indirect',
        title: '产业链映射消息',
        publish_time: '2026-11-10T09:40:00+08:00',
        impact_score: 80,
        verified: true,
        related_stocks: [{ code: '002384', name: '东山精密', relation_type: 'indirect' }],
      },
      {
        id: 'old',
        title: '过期消息',
        publish_time: '2026-11-01T09:40:00+08:00',
        impact_score: 80,
        verified: true,
        related_stocks: [{ code: '002384', name: '东山精密', relation_type: 'direct' }],
      },
    ],
    announcementsByCode: {
      '002384': {
        list: [{
          art_code: 'ANN-1',
          title_ch: '关于注销已回购股份暨股份变动的公告',
          display_time: '2026-11-10 08:00:00',
          codes: [{ stock_code: '002384', short_name: '东山精密' }],
        }],
      },
    },
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].id, 'news:002384:direct');
  assert.equal(items[1].type, '股份回购注销');
  assert.equal(items[1].stockName, '东山精密');
});

test('interprets Eastmoney date-times as China Standard Time', () => {
  assert.equal(publishedAt('2026-11-10 08:00:00'), '2026-11-10T00:00:00.000Z');
  assert.equal(publishedAt('2026-11-10T08:00:00.123'), '2026-11-10T00:00:00.123Z');
});
