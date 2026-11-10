'use strict';

const POSITIVE_ANNOUNCEMENT_RULES = [
  {
    type: '股份回购注销',
    score: 82,
    pattern: /(?:回购.{0,12}注销|注销.{0,12}回购|注销已回购股份)/,
    summary: '公司披露股份回购注销相关进展，通常有助于减少流通股份并改善每股指标。',
  },
  {
    type: '股份回购',
    score: 74,
    pattern: /(?:股份回购|回购股份|回购公司股份|回购报告书|回购进展)/,
    summary: '公司披露股份回购相关安排或进展，体现管理层对公司价值的关注。',
  },
  {
    type: '股东增持',
    score: 70,
    pattern: /(?:增持计划|增持公司股份|增持股份|完成增持)/,
    summary: '公司披露重要股东或管理层增持信息，市场通常视为积极信号。',
  },
  {
    type: '业绩改善',
    score: 78,
    pattern: /(?:业绩预增|业绩大幅增长|扭亏为盈|实现扭亏|净利润预增)/,
    summary: '公司披露业绩改善信息，基本面预期可能得到上修。',
  },
  {
    type: '中标与订单',
    score: 68,
    pattern: /(?:中标通知|项目中标|重大合同|签订.{0,8}合同|获得.{0,8}订单)/,
    summary: '公司披露中标、订单或重大合同，可能对后续收入形成正向贡献。',
  },
  {
    type: '审批获准',
    score: 66,
    pattern: /(?:获得批准|获批|取得批复|注册申请获准|通过认证)/,
    summary: '公司披露审批或认证取得进展，相关业务推进的不确定性有所下降。',
  },
  {
    type: '利润分配',
    score: 62,
    pattern: /(?:现金分红|利润分配预案|年度分红|特别分红)/,
    summary: '公司披露利润分配或分红安排，股东回报预期有所提升。',
  },
];

const ANNOUNCEMENT_EXCLUSIONS = /(?:终止回购|不实施回购|回购期限届满未实施|减持|处罚|立案|亏损|风险提示|异常波动|澄清|监管函|问询函|诉讼|冻结|退市|终止上市)/;
const DEFAULT_MAX_AGE_MS = 72 * 60 * 60 * 1000;

function normalizeCode(value) {
  const match = String(value || '').match(/\d{6}/);
  return match ? match[0] : '';
}

function publishedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const chinaLocalTime = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(raw);
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = chinaLocalTime && !hasTimeZone
    ? `${raw.replace(' ', 'T')}${raw.length === 10 ? 'T00:00:00' : ''}+08:00`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function isFresh(dateTime, now, maxAgeMs) {
  const published = new Date(dateTime).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(published) || !Number.isFinite(current)) return false;
  const age = current - published;
  return age >= -10 * 60 * 1000 && age <= maxAgeMs;
}

function announcementStockName(item, code) {
  const stocks = Array.isArray(item && item.codes) ? item.codes : [];
  const matched = stocks.find((stock) => normalizeCode(stock && (stock.stock_code || stock.code)) === code);
  return String(matched && (matched.short_name || matched.stock_name || matched.name) || code).trim();
}

function classifyAnnouncement(title) {
  const text = String(title || '').trim();
  if (!text || ANNOUNCEMENT_EXCLUSIONS.test(text)) return null;
  return POSITIVE_ANNOUNCEMENT_RULES.find((rule) => rule.pattern.test(text)) || null;
}

function buildAnnouncementEvents(code, payload, { now, maxAgeMs }) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload && payload.list) ? payload.list : [];
  return rows.flatMap((item, index) => {
    const title = String(item && (item.title_ch || item.title) || '').trim();
    const rule = classifyAnnouncement(title);
    const dateTime = publishedAt(item && (item.display_time || item.notice_date || item.publish_time));
    if (!rule || !dateTime || !isFresh(dateTime, now, maxAgeMs)) return [];
    const sourceId = String(item.art_code || item.id || `${dateTime}:${index}`).trim();
    return [{
      id: `announcement:${code}:${sourceId}`,
      code,
      stockName: announcementStockName(item, code),
      type: rule.type,
      title,
      summary: rule.summary,
      publishedAt: dateTime,
      source: '东方财富 · 公司公告',
      sourceType: 'announcement',
      impactScore: rule.score,
      url: String(item.url || `https://data.eastmoney.com/notices/detail/${code}/${sourceId}.html`),
    }];
  });
}

function buildNewsEvents(codeSet, newsFeed, { now, maxAgeMs }) {
  return (Array.isArray(newsFeed) ? newsFeed : []).flatMap((item) => {
    const impactScore = Number(item && item.impact_score);
    const dateTime = publishedAt(item && item.publish_time);
    if (item && item.verified === false) return [];
    if (!Number.isFinite(impactScore) || impactScore < 15 || !dateTime || !isFresh(dateTime, now, maxAgeMs)) return [];
    const relations = Array.isArray(item.related_stocks) ? item.related_stocks : [];
    return relations.flatMap((stock) => {
      const code = normalizeCode(stock && (stock.code || stock.stockCode));
      if (!codeSet.has(code) || stock.relation_type === 'indirect') return [];
      return [{
        id: `news:${code}:${String(item.id)}`,
        code,
        stockName: String(stock.name || code),
        type: impactScore >= 60 ? '重大利好快讯' : '利好快讯',
        title: String(item.title || '').trim(),
        summary: String(item.ai_comment || item.content || '该消息与自选股直接相关，可能形成正向催化。').trim(),
        publishedAt: dateTime,
        source: String(item.source || '市场快讯'),
        sourceType: 'news',
        impactScore,
        url: String(item.url || ''),
      }];
    });
  });
}

function buildWatchlistEvents({ codes, newsFeed = [], announcementsByCode = {}, now = new Date(), maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  const normalizedCodes = Array.from(new Set((Array.isArray(codes) ? codes : []).map(normalizeCode).filter(Boolean)));
  const codeSet = new Set(normalizedCodes);
  const events = [
    ...buildNewsEvents(codeSet, newsFeed, { now, maxAgeMs }),
    ...normalizedCodes.flatMap((code) => buildAnnouncementEvents(code, announcementsByCode[code], { now, maxAgeMs })),
  ];
  const seen = new Set();
  return events.filter((event) => {
    if (!event.title || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
}

module.exports = {
  ANNOUNCEMENT_EXCLUSIONS,
  POSITIVE_ANNOUNCEMENT_RULES,
  buildWatchlistEvents,
  classifyAnnouncement,
  publishedAt,
};
