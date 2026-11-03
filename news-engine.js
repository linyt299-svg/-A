'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SENTIMENTS = ['极度利好', '偏利好', '中性', '偏利空', '极度利空'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NEWS_API_URL = 'https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=-21101&track=website&pagesize=15';

const AUTHORITY_PATTERNS = [/交易所/, /上交所/, /深交所/, /北交所/, /证监会/, /公司公告/, /巨潮资讯/];
const MEDIA_PATTERNS = [/财联社/, /新华社/, /证券时报/, /中国证券报/, /上海证券报/, /新浪财经/, /东方财富/, /第一财经/, /同花顺/];
const POSITIVE_PATTERNS = [/大涨/, /涨超/, /站上/, /上调/, /增持/, /回购/, /降息/, /利率.*(?:降至|下调)/, /中标/, /订单/, /获批/, /扭亏/, /突破/, /扩产/, /收购/, /并购/];
const NEGATIVE_PATTERNS = [/大跌/, /跌超/, /失守/, /下调/, /减持/, /处罚/, /立案/, /亏损/, /终止/, /暴跌/, /制裁/];
const EVENT_LINKAGE_RULES = [
  {
    matches: [/迈威尔|Marvell/i, /Lumentum|鲁门特姆/i],
    sectors: ['AI 基础设施', '光通信', '高速通信 PCB'],
    stocks: [
      {
        code: '002384',
        name: '东山精密',
        relation_type: 'indirect',
        confidence: 0.55,
        relation_reason: '公司布局高速通信 PCB 等精密制造；电光融合并购可能抬升产业链预期，但尚无该交易带来新增订单的确认。',
      },
    ],
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sourceWeight(source) {
  const name = String(source || '').trim();
  if (AUTHORITY_PATTERNS.some((pattern) => pattern.test(name))) return 1;
  if (MEDIA_PATTERNS.some((pattern) => pattern.test(name))) return 0.8;
  return 0.3;
}

function reliabilityWeight(item) {
  const base = sourceWeight(item && item.source);
  const unverifiedBullishRumor = base === 0.3 && item && item.verified === false && Number(item.impact_score) > 0;
  return unverifiedBullishRumor ? -0.2 : base;
}

function timeDecay(publishTime, now = new Date(), halfLifeDays = 1) {
  const published = new Date(publishTime);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(published.getTime()) || Number.isNaN(current.getTime())) return 0;
  const ageDays = Math.max(0, current.getTime() - published.getTime()) / DAY_MS;
  return Math.pow(0.5, ageDays / Math.max(0.01, halfLifeDays));
}

function normalizeStock(stock) {
  return {
    code: String(stock && (stock.code || stock.stockCode) || '').replace(/\D/g, '').slice(-6),
    name: String(stock && stock.name || '').trim(),
    relation_type: stock && stock.relation_type === 'indirect' ? 'indirect' : 'direct',
    confidence: clamp(Number(stock && stock.confidence) || (stock && stock.relation_type === 'indirect' ? 0.5 : 1), 0, 1),
    relation_reason: String(stock && stock.relation_reason || '').trim(),
  };
}

function inferImpact(item) {
  const text = `${item && item.title || ''} ${item && (item.digest || item.content || item.short) || ''}`;
  const importance = Number(item && (item.importance ?? item.import)) || 0;
  const magnitude = importance >= 3 ? 55 : importance >= 2 ? 42 : 28;
  const positive = POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  const negative = NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
  if (positive && !negative) return magnitude;
  if (negative && !positive) return -magnitude;
  return 0;
}

function adaptProviderItem(item) {
  if (!item || typeof item !== 'object') return item;
  const isTonghuashun = item.ctime != null || item.digest != null || item.import != null;
  if (!isTonghuashun) return item;
  const impact = inferImpact(item);
  const publishTime = Number(item.ctime) > 0
    ? new Date(Number(item.ctime) * 1000).toISOString()
    : String(item.publish_time || '');
  return {
    ...item,
    id: `10jqka-${item.id || item.seq || item.ctime}`,
    content: String(item.digest || item.short || item.content || ''),
    publish_time: publishTime,
    source: String(item.source || '同花顺重要快讯'),
    sentiment: sentimentFromImpact(impact),
    impact_score: impact,
    importance: Number(item.import) || 0,
    related_sectors: Array.isArray(item.field)
      ? item.field.map((field) => String(field && field.name || '').trim()).filter(Boolean)
      : [],
    related_stocks: Array.isArray(item.stock) ? item.stock : [],
    ai_comment: impact === 0
      ? '重要快讯已收录；方向性仍需结合产业链关系与后续市场反馈确认。'
      : '根据快讯关键词生成初筛影响，需结合公告、订单与价格反馈进一步验证。',
    verified: true,
  };
}

function applyEventLinkages(item) {
  const text = `${item.title} ${item.content}`;
  const matchedRules = EVENT_LINKAGE_RULES.filter((rule) =>
    rule.matches.every((pattern) => pattern.test(text)));
  if (!matchedRules.length) return item;
  const sectors = new Set(item.related_sectors);
  const stocks = [...item.related_stocks];
  matchedRules.forEach((rule) => {
    rule.sectors.forEach((sector) => sectors.add(sector));
    rule.stocks.forEach((stock) => {
      const existing = stocks.find((candidate) => candidate.code === stock.code);
      if (!existing) stocks.push(stock);
    });
  });
  return {
    ...item,
    related_sectors: [...sectors].slice(0, 12),
    related_stocks: stocks.slice(0, 20),
    ai_comment: matchedRules[0].stocks[0].relation_reason,
  };
}

function normalizeNewsItem(item) {
  const adapted = adaptProviderItem(item);
  const normalized = {
    id: String(adapted && adapted.id || '').trim(),
    title: String(adapted && adapted.title || '').trim(),
    content: String(adapted && adapted.content || '').trim(),
    publish_time: String(adapted && adapted.publish_time || '').trim(),
    source: String(adapted && adapted.source || '').trim(),
    sentiment: SENTIMENTS.includes(adapted && adapted.sentiment) ? adapted.sentiment : '中性',
    impact_score: clamp(Number(adapted && adapted.impact_score) || 0, -100, 100),
    importance: clamp(Number(adapted && adapted.importance) || 0, 0, 3),
    related_sectors: Array.isArray(adapted && adapted.related_sectors)
      ? adapted.related_sectors.map((sector) => String(sector).trim()).filter(Boolean).slice(0, 12)
      : [],
    related_stocks: Array.isArray(adapted && adapted.related_stocks)
      ? adapted.related_stocks.map(normalizeStock).filter((stock) => stock.code && stock.name).slice(0, 20)
      : [],
    ai_comment: String(adapted && adapted.ai_comment || '').trim(),
    verified: adapted && adapted.verified !== false,
    url: String(adapted && adapted.url || '').trim(),
  };
  if (!normalized.id || !normalized.title || Number.isNaN(new Date(normalized.publish_time).getTime())) return null;
  return applyEventLinkages(normalized);
}

function normalizeNewsPayload(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && (payload.items || (payload.data && payload.data.list) || payload.data || payload.news);
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.map(normalizeNewsItem).filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).sort((left, right) => new Date(right.publish_time) - new Date(left.publish_time));
}

async function loadNewsFeed({ apiUrl = '', apiKey = '', provider = '10jqka', dataFile = path.join(__dirname, 'data', 'news.json') } = {}) {
  const remoteUrl = apiUrl || (provider === '10jqka' ? DEFAULT_NEWS_API_URL : '');
  if (remoteUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const headers = {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (!apiUrl && provider === '10jqka') headers.Referer = 'https://news.10jqka.com.cn/';
      const response = await fetch(remoteUrl, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`新闻 API 返回 ${response.status}`);
      return normalizeNewsPayload(await response.json());
    } finally {
      clearTimeout(timer);
    }
  }
  return normalizeNewsPayload(JSON.parse(await fs.readFile(dataFile, 'utf8')));
}

function filterNewsForStock(items, code) {
  const normalizedCode = String(code || '').replace(/\D/g, '').slice(-6);
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const relation = item.related_stocks.find((stock) => stock.code === normalizedCode);
    if (!relation) return [];
    if (relation.relation_type !== 'indirect') return [{ ...item, stock_relation: relation }];
    const confidence = clamp(Number(relation.confidence) || 0.5, 0, 1);
    const impact = clamp(Number(item.impact_score || 0) * confidence, -100, 100);
    return [{
      ...item,
      market_impact_score: item.impact_score,
      impact_score: Number(impact.toFixed(2)),
      sentiment: sentimentFromImpact(impact),
      stock_relation: relation,
      relation_adjusted: true,
    }];
  });
}

function sentimentFromImpact(impact) {
  if (impact >= 60) return '极度利好';
  if (impact >= 15) return '偏利好';
  if (impact <= -60) return '极度利空';
  if (impact <= -15) return '偏利空';
  return '中性';
}

function scoreNews(items, { now = new Date(), halfLifeDays = 1 } = {}) {
  const contributions = (Array.isArray(items) ? items : []).map((item) => {
    const decay = timeDecay(item.publish_time, now, halfLifeDays);
    const source = reliabilityWeight(item);
    const importance = Math.max(0.25, Math.abs(Number(item.impact_score) || 0) / 100);
    const effectiveWeight = Math.abs(source) * decay * importance;
    const adjustedImpact = clamp(Number(item.impact_score) || 0, -100, 100) * source * decay;
    return {
      ...item,
      source_weight: source,
      time_decay: Number(decay.toFixed(4)),
      adjusted_impact: Number(adjustedImpact.toFixed(2)),
      effectiveWeight,
      anti_rumor_flag: source < 0,
    };
  });
  const denominator = contributions.reduce((total, item) => total + item.effectiveWeight, 0);
  const numerator = contributions.reduce((total, item) => total + item.adjusted_impact * Math.max(0.25, Math.abs(item.impact_score) / 100), 0);
  const netImpact = denominator ? clamp(numerator / denominator, -100, 100) : 0;
  const score = clamp((netImpact + 100) / 2, 0, 100);
  return {
    score: Math.round(score),
    net_impact: Number(netImpact.toFixed(2)),
    sentiment: sentimentFromImpact(netImpact),
    count: contributions.length,
    half_life_days: halfLifeDays,
    items: contributions.sort((left, right) =>
      Math.abs(right.adjusted_impact) - Math.abs(left.adjusted_impact)),
  };
}

function buildMarketCatalysts(items, { now = new Date(), limit = 15 } = {}) {
  return scoreNews(items, { now }).items
    .filter((item) => item.time_decay >= 0.35)
    .sort((left, right) => {
      const importanceGap = Number(right.importance || 0) - Number(left.importance || 0);
      return importanceGap || Math.abs(right.adjusted_impact) - Math.abs(left.adjusted_impact)
        || new Date(right.publish_time) - new Date(left.publish_time);
    })
    .slice(0, limit);
}

module.exports = {
  DEFAULT_NEWS_API_URL,
  SENTIMENTS,
  buildMarketCatalysts,
  filterNewsForStock,
  loadNewsFeed,
  normalizeNewsItem,
  normalizeNewsPayload,
  reliabilityWeight,
  scoreNews,
  sentimentFromImpact,
  sourceWeight,
  timeDecay,
};
