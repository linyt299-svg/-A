/* 观澜投研 · client */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STORAGE_KEY = 'guanlan.watchlist.v1';
  const LAST_CODE_KEY = 'guanlan.lastCode.v1';
  const DEFAULT_WATCHLIST = ['600519', '300750', '002594', '601318', '000858', '688981'];
  const RANGE_COUNT = { '1M': 22, '3M': 66, '6M': 132, '1Y': 250 };
  const CORRECTION_KEY_PREFIX = 'guanlan.ai-corrections.v1.';
  const COPILOT_WIDTH_KEY = 'guanlan.copilot-width.v1';
  const DEFAULT_COPILOT_RATIO = 0.35;
  const COPILOT_EDITABLE_FIELDS = {
    stockIndustry: { label: '所属行业', section: '个股总览' },
    conclusionAdviceTitle: { label: 'AI 建议标题', section: '核心结论' },
    conclusionAdviceText: { label: 'AI 建议正文', section: '核心结论' },
    conclusionSupport: { label: '支撑位', section: '核心结论' },
    conclusionResistance: { label: '压力位', section: '核心结论' },
    conclusionTechTitle: { label: '技术结论标题', section: '技术面' },
    conclusionTechText: { label: '技术结论正文', section: '技术面' },
    conclusionFlowTitle: { label: '资金结论标题', section: '资金面' },
    conclusionFlowText: { label: '资金结论正文', section: '资金面' },
    forecastBasis: { label: '明日预判依据', section: '明日预判' },
    forecastNarrative: { label: '明日预判解读', section: '明日预判' },
    quantTrigger: { label: '量化触发条件', section: '量化指导' },
    quantEntry: { label: '量化入场方式', section: '量化指导' },
    quantStop: { label: '量化防守条件', section: '量化指导' },
    forecastRisk: { label: '风险提示', section: '量化指导' },
  };

  const state = {
    code: normalizeCode(new URLSearchParams(location.search).get('code')) || localStorage.getItem(LAST_CODE_KEY) || '600519',
    data: null,
    range: '3M',
    watchlist: loadWatchlist(),
    watchItems: [],
    chart: null,
    requestSeq: 0,
    positionAdvice: null,
    positionSeq: 0,
    loading: false,
    searchItems: [],
    searchFocus: -1,
    searchTimer: null,
    toastTimer: null,
    autoTimer: null,
    copilotHistory: [],
    copilotBusy: false,
    copilotSeq: 0,
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function normalizeCode(value) {
    const match = String(value || '').match(/\d{6}/);
    return match ? match[0] : '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function fmtPrice(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('zh-CN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function fmtPct(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
  }

  function fmtSigned(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
  }

  function fmtMoney(value, { signed = false, digits = 2 } = {}) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const sign = signed && n > 0 ? '+' : '';
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${sign}${(n / 1e12).toFixed(digits)}万亿`;
    if (abs >= 1e8) return `${sign}${(n / 1e8).toFixed(digits)}亿`;
    if (abs >= 1e4) return `${sign}${(n / 1e4).toFixed(digits)}万`;
    return `${sign}${n.toFixed(0)}`;
  }

  function fmtVolumeLots(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿手`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万手`;
    return `${n.toFixed(0)}手`;
  }

  function fmtMarketValue(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`;
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    return n.toFixed(0);
  }

  function toneClass(value) {
    return value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  }

  function aiDriverSummary(ai) {
    const factors = Array.isArray(ai && ai.factors)
      ? ai.factors.filter((factor) => Number.isFinite(Number(factor.score)))
      : [];
    if (!factors.length) return '因子数据仍在补充，暂不展开归因。';
    const ranked = factors.slice().sort((a, b) => Number(b.score) - Number(a.score));
    const strongest = ranked[0];
    const weakest = ranked[ranked.length - 1];
    if (strongest === weakest) return `${strongest.label}是当前主要信号，因子得分 ${strongest.score}。`;
    return `主要驱动：${strongest.label} ${strongest.score} 分；主要拖累：${weakest.label} ${weakest.score} 分。`;
  }

  function aiActionTitle(ai) {
    if (ai.stanceKey === 'bull' || ai.stanceKey === 'lean-bull') return '等待回踩或突破确认';
    if (ai.stanceKey === 'bear' || ai.stanceKey === 'lean-bear') return '反弹留意压力，跌破优先防守';
    return '区间内观望，等待方向选择';
  }

  function signClass(value) {
    return value > 0 ? 'is-up' : value < 0 ? 'is-down' : '';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const parts = String(dateStr).slice(0, 10).split('-');
    if (parts.length !== 3) return String(dateStr);
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  function shortDate(dateStr) {
    if (!dateStr) return '—';
    const parts = String(dateStr).slice(0, 10).split('-');
    return parts.length === 3 ? `${Number(parts[1])}.${Number(parts[2])}` : dateStr;
  }

  function shanghaiNow() {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    return {
      date: `${get('year')}.${get('month')}.${get('day')}`,
      weekday: get('weekday'),
      time: `${get('hour')}:${get('minute')}:${get('second')}`,
    };
  }

  function updateClock() {
    const now = shanghaiNow();
    const clock = $('#clock');
    const today = $('#today');
    if (clock) clock.textContent = now.time;
    if (today) today.textContent = `${now.date} ${now.weekday}`;
  }

  function toast(message, type = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast is-visible${type === 'error' ? ' is-error' : ''}`;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
    }, 2600);
  }

  function setLoading(active) {
    state.loading = active;
    const bar = $('#loadingBar');
    const button = $('#refreshBtn');
    if (active) {
      bar.className = 'loading-bar is-loading';
      button.classList.add('is-spinning');
      button.disabled = true;
    } else {
      bar.className = 'loading-bar is-done';
      button.classList.remove('is-spinning');
      button.disabled = false;
      setTimeout(() => {
        if (!state.loading) bar.className = 'loading-bar';
      }, 550);
    }
  }

  function loadWatchlist() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(raw)) {
        const valid = raw.map(normalizeCode).filter(Boolean).slice(0, 12);
        if (valid.length) return Array.from(new Set(valid));
      }
    } catch {
      /* ignore malformed storage */
    }
    return DEFAULT_WATCHLIST.slice();
  }

  function saveWatchlist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.watchlist));
  }

  function isWatched(code) {
    return state.watchlist.includes(code);
  }

  function addWatch(code, { silent = false } = {}) {
    if (!code) return false;
    if (isWatched(code)) {
      if (!silent) toast('该股票已在自选列表中');
      return false;
    }
    if (state.watchlist.length >= 12) {
      toast('自选股最多 12 只，请先移除一只', 'error');
      return false;
    }
    state.watchlist.push(code);
    saveWatchlist();
    refreshWatchlist();
    updateStar();
    if (!silent) toast('已加入自选');
    return true;
  }

  function removeWatch(code) {
    state.watchlist = state.watchlist.filter((c) => c !== code);
    saveWatchlist();
    refreshWatchlist();
    updateStar();
    toast('已移出自选');
  }

  async function toggleWatch() {
    if (!state.code) return;
    if (isWatched(state.code)) removeWatch(state.code);
    else addWatch(state.code);
  }

  function updateStar() {
    const button = $('#starBtn');
    if (!button) return;
    const active = isWatched(state.code);
    button.classList.toggle('is-active', active);
    button.title = active ? '移出自选' : '加入自选';
    button.setAttribute('aria-label', button.title);
  }

  // -------------------------------------------------------------------------
  // Watchlist
  // -------------------------------------------------------------------------

  async function refreshWatchlist() {
    const container = $('#watchlist');
    if (!container) return;
    if (!state.watchlist.length) {
      container.innerHTML = '<p class="search-empty">还没有自选股，点击下方添加。</p>';
      $('#watchAvg').textContent = '—';
      $('#watchBreadth').textContent = '—';
      return;
    }
    const seq = (state.watchSeq || 0) + 1;
    state.watchSeq = seq;
    try {
      const response = await fetch(`/api/watchlist?codes=${encodeURIComponent(state.watchlist.join(','))}`);
      if (!response.ok) throw new Error('watchlist request failed');
      const payload = await response.json();
      if (seq !== state.watchSeq) return;
      state.watchItems = Array.isArray(payload.items) ? payload.items : [];
      renderWatchlist();
    } catch {
      if (seq === state.watchSeq) container.innerHTML = '<p class="search-empty">自选行情暂时不可用</p>';
    }
  }

  function markActiveWatch() {
    $$('.watch-item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.code === state.code);
    });
  }

  function sparkPath(values, width = 40, height = 18) {
    const list = values.map(Number).filter(Number.isFinite);
    if (list.length < 2) return '';
    const min = Math.min(...list);
    const max = Math.max(...list);
    const span = max - min || 1;
    const step = width / (list.length - 1);
    return list.map((value, i) => {
      const x = (i * step).toFixed(2);
      const y = (height - 1 - ((value - min) / span) * (height - 2)).toFixed(2);
      return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
    }).join(' ');
  }

  function renderWatchlist() {
    const container = $('#watchlist');
    if (!container) return;
    if (!state.watchItems.length) {
      container.innerHTML = '<p class="search-empty">暂无行情数据</p>';
      return;
    }
    container.innerHTML = state.watchItems.map((item) => {
      const active = item.code === state.code;
      const direction = toneClass(item.changePct);
      const spark = sparkPath(item.spark || []);
      return `
        <div class="watch-item${active ? ' is-active' : ''}" data-code="${escapeHtml(item.code)}" role="button" tabindex="0" aria-label="查看 ${escapeHtml(item.name)}">
          <div class="watch-main">
            <div class="watch-copy">
              <b>${escapeHtml(item.name)}</b>
              <small>${escapeHtml(item.code)} · ${escapeHtml(item.market)}</small>
            </div>
          </div>
          <div class="watch-quote">
            <b>${fmtPrice(item.price)}</b>
            <small class="${direction}">${fmtPct(item.changePct)}</small>
          </div>
          <svg class="watch-spark ${direction}" viewBox="0 0 40 18" preserveAspectRatio="none" aria-hidden="true">
            <path d="${spark}"></path>
          </svg>
          <button class="watch-remove" type="button" data-remove="${escapeHtml(item.code)}" aria-label="移除 ${escapeHtml(item.name)}">
            <svg class="icon"><use href="#i-close"/></svg>
          </button>
        </div>`;
    }).join('');

    const changes = state.watchItems.map((item) => num(item.changePct));
    const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
    const up = changes.filter((v) => v > 0).length;
    const down = changes.filter((v) => v < 0).length;
    $('#watchAvg').textContent = fmtPct(avg);
    $('#watchAvg').className = toneClass(avg);
    $('#watchBreadth').textContent = `${up} / ${down}`;
  }

  function bindWatchlistEvents() {
    const container = $('#watchlist');
    container.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        event.stopPropagation();
        removeWatch(remove.dataset.remove);
        return;
      }
      const item = event.target.closest('.watch-item');
      if (item && item.dataset.code && item.dataset.code !== state.code) {
        loadStock(item.dataset.code);
      }
    });
    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('.watch-item');
      if (item && item.dataset.code) {
        event.preventDefault();
        loadStock(item.dataset.code);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  function bindSearch() {
    const input = $('#stockSearch');
    const results = $('#searchResults');

    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(state.searchTimer);
      state.searchFocus = -1;
      if (!query) {
        results.hidden = true;
        return;
      }
      state.searchTimer = setTimeout(() => performSearch(query), 220);
    });

    input.addEventListener('keydown', (event) => {
      const buttons = $$('.search-result', results);
      if (event.key === 'ArrowDown') {
        if (!buttons.length) return;
        event.preventDefault();
        state.searchFocus = (state.searchFocus + 1) % buttons.length;
        highlightSearchResult(buttons);
      } else if (event.key === 'ArrowUp') {
        if (!buttons.length) return;
        event.preventDefault();
        state.searchFocus = (state.searchFocus - 1 + buttons.length) % buttons.length;
        highlightSearchResult(buttons);
      } else if (event.key === 'Enter') {
        const chosen = buttons[state.searchFocus] || buttons[0];
        const directCode = input.value.trim().match(/^\d{6}$/);
        if (chosen) {
          event.preventDefault();
          selectStock(chosen.dataset.code, chosen.dataset.name);
        } else if (directCode) {
          event.preventDefault();
          selectStock(directCode[0], '');
        }
      } else if (event.key === 'Escape') {
        results.hidden = true;
        input.blur();
      }
    });

    results.addEventListener('click', (event) => {
      const button = event.target.closest('.search-result');
      if (button) selectStock(button.dataset.code, button.dataset.name);
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#searchShell')) results.hidden = true;
    });

    document.addEventListener('keydown', (event) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (event.key === '/' && !typing) {
        event.preventDefault();
        input.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });

    $('#addWatchBtn').addEventListener('click', focusSearch);
    $('#addWatchWide').addEventListener('click', focusSearch);
  }

  function focusSearch() {
    const input = $('#stockSearch');
    input.focus();
    input.select();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function highlightSearchResult(buttons) {
    buttons.forEach((button, index) => {
      button.classList.toggle('is-focused', index === state.searchFocus);
      if (index === state.searchFocus) button.scrollIntoView({ block: 'nearest' });
    });
  }

  async function performSearch(query) {
    const results = $('#searchResults');
    results.hidden = false;
    results.innerHTML = '<div class="search-empty">正在搜索…</div>';
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();
      if (query !== $('#stockSearch').value.trim()) return;
      state.searchItems = payload.items || [];
      if (!state.searchItems.length) {
        results.innerHTML = `<div class="search-empty">没有找到「${escapeHtml(query)}」对应的 A 股</div>`;
        return;
      }
      results.innerHTML = `
        <div class="search-results-head"><span>搜索结果</span><span>${state.searchItems.length} 只</span></div>
        ${state.searchItems.map((item, index) => `
          <button class="search-result${index === 0 ? ' is-focused' : ''}" type="button" data-code="${escapeHtml(item.code)}" data-name="${escapeHtml(item.name)}">
            <span class="result-code">${escapeHtml(item.code)}</span>
            <span class="result-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.industry || 'A 股')} · ${escapeHtml(item.pinyin || '')}</small></span>
            <span class="result-market">${escapeHtml(item.market)}</span>
          </button>`).join('')}`;
      state.searchFocus = 0;
    } catch {
      results.innerHTML = '<div class="search-empty">搜索服务暂时不可用，请直接输入 6 位代码</div>';
    }
  }

  function selectStock(code, name) {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    $('#stockSearch').value = '';
    $('#searchResults').hidden = true;
    addWatch(normalized, { silent: true });
    loadStock(normalized);
    if (name) toast(`正在查看 ${name}`);
  }

  // -------------------------------------------------------------------------
  // Main load / render
  // -------------------------------------------------------------------------

  async function loadStock(code, { refresh = false, silent = false } = {}) {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    const changedStock = state.code !== normalized;
    state.code = normalized;
    if (changedStock) resetCopilotConversation();
    localStorage.setItem(LAST_CODE_KEY, normalized);
    state.positionAdvice = null;
    if ($('#positionDialog').open) closePositionDialog();
    markActiveWatch();
    const seq = ++state.requestSeq;
    if (!silent) setLoading(true);

    try {
      const response = await fetch(`/api/stock?code=${normalized}${refresh ? '&refresh=1' : ''}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '行情数据获取失败');
      if (seq !== state.requestSeq) return;
      state.data = payload;
      renderAll();
      updateStar();
      if (payload.stale) toast('上游数据源波动，当前展示最近一次成功快照', 'error');
    } catch (error) {
      if (seq !== state.requestSeq) return;
      console.error(error);
      if (!state.data) renderFatalError(error.message);
      toast(error.message || '数据加载失败，请稍后重试', 'error');
    } finally {
      if (seq === state.requestSeq && !silent) setLoading(false);
      if (seq === state.requestSeq && silent) setLoading(false);
    }
  }

  function renderAll() {
    if (!state.data) return;
    renderQuote();
    renderConclusions();
    renderForecast();
    renderPosition();
    renderTrend();
    renderTechnical();
    renderFlow();
    renderInstitutions();
    renderAnnouncements();
    renderMarkets();
    renderAi();
    renderSources();
    renderMeta();
    applyStoredCorrections();
    updateCopilotContext();
    updateStar();
    refreshWatchlist();
    $('#heroLoading').classList.add('is-hidden');
    $('#chartLoading').classList.add('is-hidden');
  }

  function renderMeta() {
    const d = state.data;
    const updated = new Date(d.generatedAt);
    const time = updated.toLocaleTimeString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    $('#updateTime').textContent = time;
    $('#tradingDate').textContent = formatDate(d.tradingDate);
    $('#sourceLabel').textContent = d.stale ? '快照数据' : '东方财富公开数据';
    const status = d.status || {};
    const marketState = $('#marketState');
    marketState.classList.remove('is-open', 'is-closed', 'is-break');
    marketState.classList.add(status.state === 'open' ? 'is-open' : status.state === 'break' ? 'is-break' : 'is-closed');
    $('.market-state-copy b', marketState).textContent = status.label || '休市';
    $('.market-state-copy small', marketState).textContent = status.detail || '沪深市场';
    $('#quoteStatus').textContent = d.stale
      ? '快照数据 · 上游暂时不可用'
      : `${status.label || '行情'} · ${status.detail || '沪深市场'} · 延时 ≤ 15 分钟`;
    $('#tradingDate').textContent = formatDate(d.tradingDate);
  }

  function renderQuote() {
    const q = state.data.quote;
    const direction = toneClass(q.changePct);
    $('#stockName').textContent = q.name;
    $('#stockCode').textContent = q.code;
    $('#exchangeBadge').textContent = q.market;
    $('#stockIndustry').textContent = q.industry || '—';
    $('#stockIndustry').title = q.industryFull || q.industry || '';
    $('#stockRegion').textContent = q.region || '—';
    $('#stockPrice').textContent = fmtPrice(q.price);
    $('#prevClose').textContent = fmtPrice(q.prevClose);
    $('#stockChange').textContent = `${fmtSigned(q.change)}  ${fmtPct(q.changePct)}`;
    $('#stockChange').className = `change-pill ${q.changePct > 0 ? '' : q.changePct < 0 ? 'is-down' : 'is-flat'}`;
    $('#stockChange').title = `涨跌额 ${fmtSigned(q.change)}，涨跌幅 ${fmtPct(q.changePct)}`;

    const stats = {
      open: fmtPrice(q.open),
      high: fmtPrice(q.high),
      low: fmtPrice(q.low),
      amount: fmtMoney(q.amount),
      turnover: `${num(q.turnover).toFixed(2)}%`,
      volumeRatio: fmtPrice(q.volumeRatio),
      totalMv: fmtMarketValue(q.totalMv),
      valuation: `${q.pe != null ? q.pe.toFixed(1) : '—'} / ${q.pb != null ? q.pb.toFixed(1) : '—'}`,
    };
    Object.entries(stats).forEach(([key, value]) => {
      const el = $(`[data-stat="${key}"]`);
      if (el) el.textContent = value;
    });

    const amountEl = $('[data-stat="amount"]');
    if (amountEl) amountEl.title = `成交额 ${fmtMoney(q.amount, { digits: 2 })}元 · 成交量 ${fmtVolumeLots(q.volume)}`;
    const valuationEl = $('[data-stat="valuation"]');
    if (valuationEl) valuationEl.title = `动态 PE ${q.pe != null ? q.pe.toFixed(2) : '—'}x · PB ${q.pb != null ? q.pb.toFixed(2) : '—'}x`;

    const ai = state.data.ai;
    const flow = state.data.flow;
    const reports = state.data.reports;
    $('#heroAiTag').innerHTML = '<svg class="icon"><use href="#i-sparkles"/></svg><span>查看 AI 因子拆解</span>';
    $('#heroFlowTag').textContent = flow.historyAvailable
      ? `资金 · 5日${flow.sum5 >= 0 ? '净流入' : '净流出'} ${fmtMoney(Math.abs(flow.sum5))}`
      : `资金 · 今日${flow.today.main >= 0 ? '净流入' : '净流出'} ${fmtMoney(Math.abs(flow.today.main))}`;
    $('#heroReportTag').textContent = reports.count
      ? `机构 · 买入/增持 ${reports.positiveRatio}%`
      : '机构 · 覆盖较少';

    $('.price').classList.remove('flash-up', 'flash-down');
    // Re-trigger a subtle flash only when the value actually changes.
    const oldPrice = state.lastPrice;
    if (oldPrice != null && oldPrice !== q.price) {
      $('.price').classList.add(q.price > oldPrice ? 'flash-up' : 'flash-down');
      setTimeout(() => $('.price').classList.remove('flash-up', 'flash-down'), 650);
    }
    state.lastPrice = q.price;
    $('#stockChange').className = `change-pill ${direction === 'down' ? 'is-down' : direction === 'neutral' ? 'is-flat' : ''}`;
  }

  function formatGap(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (n > 0) return `上方 ${n.toFixed(2)}%`;
    if (n < 0) return `下方 ${Math.abs(n).toFixed(2)}%`;
    return '与现价持平';
  }

  function renderConclusions() {
    const ai = state.data.ai;
    const flow = state.data.flow;
    const price = state.data.quote.price;
    const c = ai.conclusions || {};
    const levels = ai.levels || {};

    $('#conclusionScore').textContent = ai.composite;
    $('#conclusionStance').textContent = ai.stance;
    $('#conclusionConfidence').textContent = `置信度 ${ai.confidence}%`;
    $('#conclusionAdviceTitle').textContent = c.ai && c.ai.title && c.ai.title !== ai.stance
      ? c.ai.title
      : aiActionTitle(ai);
    $('#conclusionAdviceText').textContent = c.ai
      ? c.ai.text
      : '结合支撑与压力观察量价确认，未触发条件前不追涨杀跌。';
    $('#conclusionSupport').textContent = fmtPrice(levels.support);
    $('#conclusionResistance').textContent = fmtPrice(levels.resistance);
    const supportGap = levels.supportGap != null
      ? levels.supportGap
      : price && levels.support ? ((levels.support / price) - 1) * 100 : null;
    const resistanceGap = levels.resistanceGap != null
      ? levels.resistanceGap
      : price && levels.resistance ? ((levels.resistance / price) - 1) * 100 : null;
    $('#conclusionSupportGap').textContent = formatGap(supportGap);
    $('#conclusionSupportGap').title = levels.supportSource ? `依据：${levels.supportSource}` : '';
    $('#conclusionResistanceGap').textContent = formatGap(resistanceGap);
    $('#conclusionResistanceGap').title = levels.resistanceSource ? `依据：${levels.resistanceSource}` : '';

    const technical = c.technical || {
      verdict: '中性',
      tone: 'neutral',
      title: '技术结构待确认',
      text: '等待更多量价信号确认方向。',
      upCount: 0,
      downCount: 0,
      position: 50,
    };
    $('#conclusionTechBadge').textContent = technical.verdict;
    $('#conclusionTechBadge').className = `signal-badge ${technical.tone || 'neutral'}`;
    $('#conclusionTechTitle').textContent = technical.title;
    $('#conclusionTechText').textContent = technical.text;
    $('#conclusionTechCount').textContent = `${technical.upCount ?? 0} 多 / ${technical.downCount ?? 0} 空`;
    $('#conclusionTechPosition').textContent = `${technical.position ?? 50}%`;

    const capital = c.capital || {
      verdict: flow.signal,
      tone: flow.tone === 'in' ? 'up' : flow.tone === 'out' ? 'down' : 'neutral',
      title: flow.historyAvailable
        ? `近 5 日主力${flow.sum5 >= 0 ? '净流入' : '净流出'} ${fmtMoney(Math.abs(flow.sum5))}`
        : `今日主力${flow.today.main >= 0 ? '净流入' : '净流出'} ${fmtMoney(Math.abs(flow.today.main))}`,
      text: flow.historyAvailable
        ? `今日主力 ${fmtMoney(flow.today.main, { signed: true })}，5 日累计 ${fmtMoney(flow.sum5, { signed: true })}。`
        : '多日资金序列暂缺，仅展示当日资金结构。',
    };
    $('#conclusionFlowBadge').textContent = capital.verdict;
    $('#conclusionFlowBadge').className = `signal-badge ${capital.tone || 'neutral'}`;
    $('#conclusionFlowTitle').textContent = capital.title;
    $('#conclusionFlowText').textContent = capital.text;
    $('#conclusionFlow5').textContent = flow.historyAvailable
      ? `${flow.sum5 > 0 ? '+' : ''}${fmtMoney(flow.sum5)}`
      : '—';
    $('#conclusionFlow5').className = flow.historyAvailable ? toneClass(flow.sum5) : '';
    $('#conclusionFlowToday').textContent = `${flow.today.main > 0 ? '+' : ''}${fmtMoney(flow.today.main)}`;
    $('#conclusionFlowToday').className = toneClass(flow.today.main);
  }

  function renderForecast() {
    const forecast = state.data.ai.forecast;
    const panel = $('.forecast-panel');
    if (!forecast) {
      if (panel) panel.classList.add('is-hidden');
      return;
    }
    if (panel) panel.classList.remove('is-hidden');
    const probs = forecast.probabilities || { up: 0, flat: 0, down: 0 };
    const range = forecast.range || { low: 0, high: 0 };
    $('#forecastDate').textContent = `${forecast.label} ${forecast.short} ${forecast.weekday}`;
    $('#forecastConfidence').textContent = `置信度 ${forecast.confidence}%`;
    $('#forecastTrend').textContent = forecast.trend;
    $('#forecastTrend').className = forecast.tone || '';
    const spread = probs.up - probs.down;
    $('#forecastDirection').textContent = spread > 8
      ? '上涨概率占优'
      : spread < -8
        ? '下跌概率占优'
        : '方向概率接近';
    const rows = [
      ['上涨', probs.up, 'prob-up'],
      ['震荡', probs.flat, 'prob-flat'],
      ['下跌', probs.down, 'prob-down'],
    ];
    $('#forecastProbs').innerHTML = rows.map(([label, value, cls]) => `
      <div class="forecast-prob-row">
        <span>${label}</span>
        <div class="prob-track"><i class="${cls}" style="width:${clamp(value, 2, 100)}%"></i></div>
        <b>${value}%</b>
      </div>`).join('');
    $('#forecastRange').textContent = `${fmtPrice(range.low)} – ${fmtPrice(range.high)}`;
    $('#forecastBasis').textContent = forecast.basis || '—';
    $('#forecastNarrative').textContent = forecast.narrative || 'AI 正在生成预判解读…';
    const quant = forecast.quant || {};
    $('#quantPosition').textContent = quant.position || '—';
    $('#quantTarget').textContent = quant.target || '—';
    $('#quantTrigger').textContent = quant.trigger || '—';
    $('#quantEntry').textContent = quant.entry || '—';
    $('#quantStop').textContent = quant.stop || '—';
    $('#forecastRisk').textContent = quant.riskNote || '—';
  }

  function positionStorageKey(code) {
    return `guanlan.position.v1.${code}`;
  }

  function readStoredPosition(code) {
    try {
      const raw = JSON.parse(localStorage.getItem(positionStorageKey(code)) || 'null');
      const cost = Number(raw && raw.cost);
      const shares = Number(raw && raw.shares);
      if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(shares) || shares <= 0) return null;
      const capital = Number(raw.capital);
      return {
        cost,
        shares: Math.round(shares),
        capital: Number.isFinite(capital) && capital > 0 ? capital : null,
      };
    } catch {
      return null;
    }
  }

  function saveStoredPosition(code, position) {
    localStorage.setItem(positionStorageKey(code), JSON.stringify(position));
  }

  function openPositionDialog() {
    const position = readStoredPosition(state.code);
    $('#posCost').value = position ? position.cost : '';
    $('#posShares').value = position ? position.shares : '';
    $('#posCapital').value = position && position.capital ? position.capital : '';
    const dialog = $('#positionDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => $('#posCost').focus(), 50);
  }

  function closePositionDialog() {
    const dialog = $('#positionDialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  async function fetchPositionAdvice(position) {
    const code = state.code;
    const seq = ++state.positionSeq;
    const params = new URLSearchParams({
      code,
      cost: String(position.cost),
      shares: String(position.shares),
      capital: position.capital ? String(position.capital) : '',
    });
    $('#positionAction').textContent = 'AI 计算中…';
    $('#positionConfidence').textContent = '';
    $('#positionAdvice').textContent = '正在结合成本、仓位、支撑压力与明日预判生成持仓建议…';
    try {
      const response = await fetch(`/api/position-advice?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '持仓建议生成失败');
      if (seq !== state.positionSeq || state.code !== code) return;
      state.positionAdvice = {
        ...payload.advice,
        code,
        price: payload.price,
        _key: `${code}:${position.cost}:${position.shares}:${position.capital || 0}:${state.data.quote.price}`,
      };
      renderPositionAdvice(payload.advice, position);
      updateCopilotContext();
    } catch (error) {
      if (seq !== state.positionSeq || state.code !== code) return;
      $('#positionAction').textContent = '建议暂不可用';
      $('#positionAction').className = 'neutral';
      $('#positionConfidence').textContent = '';
      $('#positionAdvice').textContent = error.message || 'AI 持仓建议暂时不可用，请稍后重试。';
    }
  }

  function renderPositionAdvice(advice, position) {
    const stats = advice.stats || {};
    const tone = advice.tone || 'neutral';
    $('#positionAction').textContent = advice.action || '持有观察';
    $('#positionAction').className = tone;
    $('#positionConfidence').textContent = advice.confidence ? `置信度 ${advice.confidence}%` : '';
    $('#positionAdvice').textContent = advice.advice || '—';
    $('#positionCost').textContent = fmtPrice(stats.cost ?? position.cost);
    $('#positionShares').textContent = Number(stats.shares ?? position.shares).toLocaleString('zh-CN');
    $('#positionWeight').textContent = stats.weight != null ? `${stats.weight.toFixed(1)}%` : '—';
    $('#positionPnl').textContent = fmtPct(stats.pnlPct);
    $('#positionPnl').className = toneClass(stats.pnlPct);
    $('#positionPnl').title = `浮动盈亏 ${fmtMoney(stats.pnl, { signed: true })}`;
    $('#positionValue').textContent = fmtMoney(stats.marketValue);
    $('#positionRisk').textContent = fmtMoney(stats.riskAmount);
    $('#positionRisk').title = stats.riskPct != null ? `占当前总资金 ${stats.riskPct}%` : '';
    $('#positionPlan').textContent = advice.plan || '—';
    $('#positionRiskNote').textContent = advice.riskNote || '—';
  }

  function renderPosition() {
    const position = readStoredPosition(state.code);
    const empty = $('#positionEmpty');
    const filled = $('#positionFilled');
    const panel = $('.forecast-panel');
    if (panel) panel.classList.toggle('has-position', Boolean(position));
    if (!position) {
      empty.classList.remove('is-hidden');
      filled.classList.add('is-hidden');
      $('#positionEditBtn').textContent = '录入持仓';
      state.positionAdvice = null;
      return;
    }

    empty.classList.add('is-hidden');
    filled.classList.remove('is-hidden');
    $('#positionEditBtn').textContent = '编辑持仓';
    const price = state.data.quote.price;
    const marketValue = price * position.shares;
    const pnlPct = ((price / position.cost) - 1) * 100;
    const weight = position.capital ? (marketValue / position.capital) * 100 : null;
    $('#positionCost').textContent = fmtPrice(position.cost);
    $('#positionShares').textContent = position.shares.toLocaleString('zh-CN');
    $('#positionWeight').textContent = weight != null ? `${weight.toFixed(1)}%` : '—';
    $('#positionPnl').textContent = fmtPct(pnlPct);
    $('#positionPnl').className = toneClass(pnlPct);
    $('#positionValue').textContent = fmtMoney(marketValue);
    $('#positionRisk').textContent = '—';

    const key = `${state.code}:${position.cost}:${position.shares}:${position.capital || 0}:${price}`;
    if (state.positionAdvice && state.positionAdvice._key === key) {
      renderPositionAdvice(state.positionAdvice, position);
      return;
    }
    fetchPositionAdvice(position);
  }

  function bindPosition() {
    $('#positionEditBtn').addEventListener('click', openPositionDialog);
    $('#positionCloseBtn').addEventListener('click', closePositionDialog);
    $('#positionCancelBtn').addEventListener('click', closePositionDialog);
    $('#positionDialog').addEventListener('click', (event) => {
      if (event.target === $('#positionDialog')) closePositionDialog();
    });
    $('#positionClearBtn').addEventListener('click', () => {
      localStorage.removeItem(positionStorageKey(state.code));
      state.positionAdvice = null;
      state.positionSeq += 1;
      closePositionDialog();
      renderPosition();
      updateCopilotContext();
      toast('已清空该股票的持仓记录');
    });
    $('#positionForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const cost = Number($('#posCost').value);
      const shares = Math.round(Number($('#posShares').value));
      const capital = Number($('#posCapital').value);
      if (!Number.isFinite(cost) || cost <= 0) {
        toast('请输入有效的持仓成本价', 'error');
        return;
      }
      if (!Number.isFinite(shares) || shares <= 0) {
        toast('请输入有效的持股数量', 'error');
        return;
      }
      if ($('#posCapital').value && (!Number.isFinite(capital) || capital <= 0)) {
        toast('总资金必须大于 0', 'error');
        return;
      }
      saveStoredPosition(state.code, {
        cost,
        shares,
        capital: Number.isFinite(capital) && capital > 0 ? capital : null,
      });
      state.positionAdvice = null;
      closePositionDialog();
      renderPosition();
      updateCopilotContext();
      toast('持仓已保存，AI 正在生成建议');
    });
  }

  function getRangeRows() {
    const rows = state.data.kline.rows;
    const count = RANGE_COUNT[state.range] || 66;
    return rows.slice(-count);
  }

  function sma(rows, period) {
    const closes = rows.map((r) => r.close);
    const out = new Array(closes.length).fill(null);
    let acc = 0;
    for (let i = 0; i < closes.length; i += 1) {
      acc += closes[i];
      if (i >= period) acc -= closes[i - period];
      if (i >= period - 1) out[i] = Number((acc / period).toFixed(2));
    }
    return out;
  }

  function renderTrend() {
    const rows = state.data.kline.rows;
    const rangeRows = getRangeRows();
    if (!state.chart) {
      const dom = $('#klineChart');
      if (window.echarts) {
        state.chart = window.echarts.init(dom, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => state.chart && state.chart.resize());
        if (window.ResizeObserver) {
          new ResizeObserver(() => state.chart && state.chart.resize()).observe(dom);
        }
      }
    }
    updateChart();

    const closes = rangeRows.map((r) => r.close);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const rangePct = first ? ((last / first) - 1) * 100 : null;
    let peak = -Infinity;
    let mdd = 0;
    closes.forEach((v) => {
      peak = Math.max(peak, v);
      if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
    });
    const returns = [];
    for (let i = 1; i < closes.length; i += 1) returns.push(Math.log(closes[i] / closes[i - 1]));
    const vol = returns.length
      ? Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) * Math.sqrt(252) * 100
      : 0;
    const t = state.data.technical;
    const position = t.high20 !== t.low20 ? ((last - t.low20) / (t.high20 - t.low20)) * 100 : 50;

    const metrics = [
      { label: '区间涨跌', value: fmtPct(rangePct), className: toneClass(rangePct) },
      { label: '最大回撤', value: fmtPct(mdd), className: 'down' },
      { label: '年化波动', value: `${vol.toFixed(1)}%`, className: '' },
      { label: '20日均额', value: fmtMoney(t.avgAmount20), className: '' },
      { label: '20日位置', value: `${clamp(position, 0, 100).toFixed(0)}%`, className: '' },
    ];
    $('#trendSummary').innerHTML = metrics.map((m) => `
      <div class="trend-metric"><span>${m.label}</span><b class="${m.className}">${m.value}</b></div>`).join('');
  }

  function chartTooltip(params) {
    const index = params[0].dataIndex;
    const rows = state.currentChartRows || [];
    const row = rows[index];
    if (!row) return '';
    const color = row.close >= row.open ? '#c45345' : '#23826a';
    const ma = state.currentMa || {};
    return `
      <div style="min-width:238px">
        <div style="display:flex;justify-content:space-between;gap:18px;margin-bottom:9px;color:rgba(255,255,255,.5);font-size:14px">
          <span>${escapeHtml(row.date)}</span><span>${row.pct > 0 ? '+' : ''}${row.pct.toFixed(2)}%</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;font-size:14px;line-height:1.55">
          <span style="color:rgba(255,255,255,.45)">开盘 <b style="color:#fff;font-weight:500">${fmtPrice(row.open)}</b></span>
          <span style="color:rgba(255,255,255,.45)">收盘 <b style="color:${color};font-weight:600">${fmtPrice(row.close)}</b></span>
          <span style="color:rgba(255,255,255,.45)">最高 <b style="color:#fff;font-weight:500">${fmtPrice(row.high)}</b></span>
          <span style="color:rgba(255,255,255,.45)">最低 <b style="color:#fff;font-weight:500">${fmtPrice(row.low)}</b></span>
          <span style="color:rgba(255,255,255,.45)">成交额 <b style="color:#fff;font-weight:500">${fmtMoney(row.amount)}</b></span>
          <span style="color:rgba(255,255,255,.45)">换手 <b style="color:#fff;font-weight:500">${row.turnover.toFixed(2)}%</b></span>
        </div>
        <div style="display:flex;gap:12px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:rgba(255,255,255,.45)">
          <span>MA5 <b style="color:#c39143;font-weight:500">${ma.ma5 ? ma.ma5[index] ?? '—' : '—'}</b></span>
          <span>MA20 <b style="color:#2e7565;font-weight:500">${ma.ma20 ? ma.ma20[index] ?? '—' : '—'}</b></span>
          <span>MA60 <b style="color:#8174a6;font-weight:500">${ma.ma60 ? ma.ma60[index] ?? '—' : '—'}</b></span>
        </div>
      </div>`;
  }

  function updateChart() {
    if (!state.chart) return;
    const rows = getRangeRows();
    state.currentChartRows = rows;
    const ma5 = sma(rows, 5);
    const ma20 = sma(rows, 20);
    const ma60 = sma(rows, 60);
    state.currentMa = { ma5, ma20, ma60 };
    const dates = rows.map((r) => r.date);
    const candles = rows.map((r) => [r.open, r.close, r.low, r.high]);
    const volumes = rows.map((r, i) => ({
      value: r.volume,
      itemStyle: { color: r.close >= r.open ? 'rgba(196,83,69,.34)' : 'rgba(35,130,106,.34)' },
    }));
    const up = '#c45345';
    const down = '#23826a';
    const lineBase = {
      type: 'line',
      symbol: 'none',
      smooth: 0.2,
      xAxisIndex: 0,
      yAxisIndex: 0,
      lineStyle: { width: 1.15 },
      emphasis: { disabled: true },
    };

    state.chart.setOption({
      animationDuration: 420,
      animationEasing: 'cubicOut',
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      },
      grid: [
        { left: 8, right: 57, top: 13, height: '64%' },
        { left: 8, right: 57, top: '80%', height: '12%' },
      ],
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#153a30', fontSize: 13 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: 'rgba(21,58,48,.25)' } },
        backgroundColor: 'rgba(13,43,36,.96)',
        borderWidth: 0,
        padding: [10, 12],
        textStyle: { color: '#eef2e9', fontSize: 14 },
        extraCssText: 'border-radius:10px;box-shadow:0 14px 32px rgba(13,43,36,.22);',
        formatter: chartTooltip,
      },
      xAxis: [
        {
          type: 'category',
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: '#e4dfd2' } },
          axisTick: { show: false },
          axisLabel: { show: false },
          splitLine: { show: false },
          axisPointer: { z: 10 },
        },
        {
          type: 'category',
          gridIndex: 1,
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: '#e4dfd2' } },
          axisTick: { show: false },
          axisLabel: {
            color: '#a09f94',
            fontSize: 12,
            margin: 10,
            interval: Math.max(0, Math.floor(rows.length / (window.innerWidth < 700 ? 4 : 7)) - 1),
            formatter: (value) => value.slice(5),
          },
          splitLine: { show: false },
          axisPointer: { label: { show: false } },
        },
      ],
      yAxis: [
        {
          scale: true,
          position: 'right',
          splitNumber: 4,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#a09f94',
            fontSize: 12,
            margin: 10,
            formatter: (value) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 }),
          },
          splitLine: { lineStyle: { color: 'rgba(20,57,47,.07)', type: 'dashed' } },
        },
        {
          scale: true,
          gridIndex: 1,
          position: 'right',
          splitNumber: 2,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: '#b4b0a6',
            fontSize: 11,
            margin: 10,
            formatter: (value) => (value >= 10000 ? (value / 10000).toFixed(0) + '万' : value),
          },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100, zoomLock: false },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: candles,
          itemStyle: {
            color: up,
            color0: down,
            borderColor: up,
            borderColor0: down,
            borderWidth: 1,
          },
          emphasis: { itemStyle: { borderWidth: 1.4 } },
        },
        { ...lineBase, name: 'MA5', data: ma5, lineStyle: { ...lineBase.lineStyle, color: '#c39143' } },
        { ...lineBase, name: 'MA20', data: ma20, lineStyle: { ...lineBase.lineStyle, color: '#2e7565' } },
        { ...lineBase, name: 'MA60', data: ma60, lineStyle: { ...lineBase.lineStyle, color: '#8174a6' } },
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: volumes,
          barWidth: '58%',
        },
      ],
    }, { notMerge: true });
  }

  function renderTechnical() {
    const t = state.data.technical;
    const signals = t.signals || [];
    $('#indicatorGrid').innerHTML = signals.map((signal) => `
      <div class="indicator-card tone-${signal.tone || 'neutral'}">
        <div class="indicator-top">
          <span class="indicator-label">${escapeHtml(signal.label)}</span>
          <i class="indicator-dot"></i>
        </div>
        <div class="indicator-value">${escapeHtml(signal.value)}</div>
        <div class="indicator-note" title="${escapeHtml(signal.note)}">${escapeHtml(signal.note)}</div>
      </div>`).join('');

    const up = signals.filter((s) => s.tone === 'up').length;
    const down = signals.filter((s) => s.tone === 'down').length;
    const warn = signals.filter((s) => s.tone === 'warn').length;
    let verdict = '中性';
    let tone = 'neutral';
    if (up >= 4) {
      verdict = '偏多';
      tone = 'up';
    } else if (down >= 4) {
      verdict = '偏空';
      tone = 'down';
    } else if (up > down + warn) {
      verdict = '中性偏多';
      tone = 'up';
    } else if (down > up + warn) {
      verdict = '中性偏空';
      tone = 'down';
    }
    $('#techVerdict').textContent = verdict;
    $('#techVerdict').className = `signal-badge ${tone}`;
    $('#techCount').textContent = `${signals.length} 项信号`;
    const resonance = signals.length ? ((up - down + signals.length) / (signals.length * 2)) * 100 : 50;
    $('#signalResonance').innerHTML = `
      <div class="resonance-copy"><span>指标共振</span><b>${up} 多 / ${down} 空</b></div>
      <div class="resonance-track"><i style="width:${clamp(resonance, 4, 96)}%"></i></div>
      <span class="resonance-note">${warn ? `${warn} 项过热提示` : '暂无过热信号'}</span>`;
  }

  function renderFlow() {
    const flow = state.data.flow;
    const main = flow.today.main;
    const flowDateText = window.innerWidth < 1400 ? shortDate(flow.date) : formatDate(flow.date);
    $('#flowDate').textContent = flow.today.live ? `${flowDateText} · 盘中` : `${flowDateText} · 最新`;
    const historyDiff = flow.historyThrough && flow.historyThrough !== flow.date;
    $('#flowHistoryDate').textContent = historyDiff ? ` · 截至 ${formatDate(flow.historyThrough)}` : '';
    $('#flowMain').textContent = `${main > 0 ? '+' : ''}${fmtMoney(main)}`;
    $('#flowMain').className = `flow-big ${signClass(main)}`;
    $('#flowMainSub').textContent = flow.today.mainPct != null
      ? `占成交额 ${fmtPct(flow.today.mainPct)}`
      : '占成交额 —';
    $('#flowSignal').textContent = flow.signal;
    $('#flowSignal').className = `flow-signal ${flow.tone === 'in' ? 'is-in' : flow.tone === 'out' ? 'is-out' : ''}`;

    const breakdown = [
      ['超大单', flow.today.superLarge],
      ['大单', flow.today.large],
      ['中单', flow.today.medium],
      ['小单', flow.today.small],
    ];
    $('#flowBreakdown').innerHTML = breakdown.map(([label, value]) => `
      <div class="flow-row"><span>${label}</span><b class="${toneClass(value)}">${value > 0 ? '+' : ''}${fmtMoney(value)}</b></div>`).join('');

    if (!flow.historyAvailable) {
      $('#flowChart').innerHTML = '<div class="flow-empty">历史资金序列暂缺，仅展示当日资金结构</div>';
      $('#flowSum5').textContent = '—';
      $('#flowSum5').className = '';
      $('#flowSum10').textContent = '—';
      $('#flowSum10').className = '';
    } else {
      const maxAbs = Math.max(1, ...flow.daily.map((d) => Math.abs(d.main)));
      $('#flowChart').innerHTML = flow.daily.map((d) => {
        const height = clamp((Math.abs(d.main) / maxAbs) * 42, 2.5, 42);
        const isIn = d.main >= 0;
        const cls = `${isIn ? 'in tozero' : 'out fromzero'}`;
        const title = `${d.date} 主力${isIn ? '净流入' : '净流出'} ${fmtMoney(Math.abs(d.main))}`;
        return `
          <div class="flow-column${d.live ? ' live' : ''}" title="${escapeHtml(title)}">
            <i class="flow-bar ${cls}" style="height:${height}%"></i>
            <span class="flow-date">${d.live ? '今日' : shortDate(d.date)}</span>
          </div>`;
      }).join('');
      $('#flowSum5').textContent = `${flow.sum5 > 0 ? '+' : ''}${fmtMoney(flow.sum5)}`;
      $('#flowSum5').className = toneClass(flow.sum5);
      $('#flowSum10').textContent = `${flow.sum10 > 0 ? '+' : ''}${fmtMoney(flow.sum10)}`;
      $('#flowSum10').className = toneClass(flow.sum10);
    }
  }

  function renderInstitutions() {
    const r = state.data.reports;
    const score = r.consensusScore == null ? 0 : r.consensusScore;
    let label = '暂无覆盖';
    let tone = '#b9b3a5';
    if (score >= 78) {
      label = '积极';
      tone = '#c45345';
    } else if (score >= 60) {
      label = '偏正面';
      tone = '#c39143';
    } else if (score >= 45) {
      label = '中性';
      tone = '#8b8b80';
    } else if (score > 0) {
      label = '偏谨慎';
      tone = '#23826a';
    }
    const dial = $('#consensusDial');
    dial.style.setProperty('--value', score);
    dial.style.setProperty('--tone', tone);
    $('#consensusScore').textContent = r.count ? score : '—';
    $('#consensusLabel').textContent = label;
    $('#consensusCoverage').textContent = r.count
      ? (window.innerWidth < 1360 ? `${r.count} 篇 · ${r.orgCount} 家` : `${r.count} 篇研报 · ${r.orgCount} 家机构`)
      : '近一年暂无研报';
    $('#instPositive').textContent = r.count ? `${r.positiveRatio}%` : '—';
    $('#instPositive').className = r.count && r.positiveRatio >= 60 ? 'up' : '';
    $('#instPositiveSub').textContent = r.count ? `买入 ${r.distribution['买入']} · 增持 ${r.distribution['增持']}` : '—';
    $('#instTarget').textContent = r.avgTarget ? `${fmtPrice(r.avgTarget)}` : '—';
    $('#instTargetSub').textContent = r.targetUpside != null ? `${fmtPct(r.targetUpside)} · ${r.targetCount} 份目标价` : '暂无一致目标价';
    $('#instEps').textContent = r.medianEpsNext ? `${fmtPrice(r.medianEpsNext)}` : '—';
    $('#instPe').textContent = r.medianPeNext ? `对应 ${fmtPrice(r.medianPeNext)}x PE` : '—';
    $('#reportHorizon').textContent = r.latestDate ? `最新 ${r.latestDate}` : '近一年';
    $('#allReportsLink').href = `https://data.eastmoney.com/report/stock.jshtml?stockcode=${state.code}`;

    const total = Math.max(1, r.count || 1);
    const ratingColors = { '买入': 'up', '增持': 'add', '中性': 'neutral', '减持': 'down' };
    $('#ratingBars').innerHTML = ['买入', '增持', '中性', '减持'].map((key) => {
      const count = r.distribution[key] || 0;
      return `<div class="rating-row"><span>${key}</span><div class="rating-track"><i style="width:0%" data-width="${(count / total) * 100}"></i></div><b>${count}</b></div>`;
    }).join('');
    requestAnimationFrame(() => {
      $$('#ratingBars .rating-track i').forEach((bar) => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    });
    $('#ratingTotal').textContent = `${r.count} 篇`;
    $('#ratingNote').textContent = r.count
      ? `买入与增持合计 ${r.positive} 篇，占 ${r.positiveRatio}%；${r.targetUpside != null ? `平均目标价较现价 ${fmtPct(r.targetUpside)}。` : '目标价披露较少，参考一致预期 EPS。'}`
      : '近期暂无机构研报覆盖，建议结合公告与行业信息独立判断。';

    $('#reportList').innerHTML = r.list.length
      ? r.list.slice(0, 5).map((report) => {
        const cls = report.rating === '买入' ? '' : report.rating === '增持' ? 'add' : 'neutral';
        const initial = String(report.org || '').replace(/证券.*$/, '').slice(0, 1) || '研';
        return `
          <a class="report-row" href="${escapeHtml(report.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(report.title)}">
            <span class="report-org-mark">${escapeHtml(initial)}</span>
            <span class="report-main">
              <span class="report-title">${escapeHtml(report.title)}</span>
              <span class="report-meta"><b>${escapeHtml(report.org)}</b><span>${escapeHtml(report.date)}</span>${report.analysts ? `<span>${escapeHtml(report.analysts)}</span>` : ''}</span>
            </span>
            <span class="report-rating ${cls}">${escapeHtml(report.rating)}</span>
          </a>`;
      }).join('')
      : '<p class="search-empty">暂无近期研报</p>';
  }

  function renderAnnouncements() {
    const a = state.data.announcements;
    $('#annCount').textContent = `${a.total.toLocaleString('zh-CN')} 条`;
    $('#allAnnLink').href = `https://data.eastmoney.com/notices/stock/${state.code}.html`;
    const important = /报告|业绩|分红|回购|增持|减持|重大|决议|董事会|股东大会/;
    $('#announcementList').innerHTML = a.list.length
      ? a.list.slice(0, 6).map((item) => {
        const date = String(item.date || '').slice(0, 10).split('-');
        return `
          <a class="ann-row${important.test(item.category || '') ? ' is-important' : ''}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ann-date"><b>${date[2] || '—'}</b>${date[1] || '—'}月</span>
            <span class="ann-line"><i></i></span>
            <span class="ann-copy">
              <span class="ann-title">${escapeHtml(item.title)}</span>
              <span class="ann-tags">
                <span class="ann-category">${escapeHtml(item.category || '公告')}</span>
                <span class="ann-link">原文 <svg class="icon"><use href="#i-arrow-up-right"/></svg></span>
              </span>
            </span>
          </a>`;
      }).join('')
      : '<p class="search-empty">暂无公告</p>';
  }

  function renderMarkets() {
    const markets = state.data.markets;
    const risk = markets.risk || {};
    const riskTone = risk.tone === 'up' ? 'up' : risk.tone === 'down' ? 'down' : 'neutral';
    $('#riskBadge').textContent = risk.label || '—';
    $('#riskBadge').className = `signal-badge ${riskTone}`;
    $('#riskScore').textContent = risk.score != null ? `${risk.score}` : '—';
    $('#riskMeterFill').style.width = `${clamp(risk.score || 50, 4, 96)}%`;

    const regionCode = { cn: 'CN', asia: 'AP', west: 'US', commodity: 'GL' };
    const codeRegion = {
      '000001': 'CN', '399001': 'CN', '399006': 'CN', '000300': 'CN',
      HSI: 'HK', N225: 'JP', KS11: 'KR',
      NDX: 'US', DJIA: 'US', SPX: 'US', FTSE: 'UK', GDAXI: 'DE',
      GC00Y: 'CM', SI00Y: 'CM', UDI: 'FX',
    };
    const regionFor = (item, group) => codeRegion[item.code] || regionCode[group.key] || '';
    $('#marketGroups').innerHTML = (markets.groups || []).map((group) => `
      <div class="market-group">
        <div class="market-group-label">${escapeHtml(group.label)}</div>
        ${group.items.map((item) => `
          <div class="market-row">
            <span class="market-name"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(regionFor(item, group))}</small></span>
            <span class="market-quote"><b>${item.value != null ? fmtPrice(item.value) : '—'}</b><em class="${toneClass(item.pct)}">${fmtPct(item.pct)}</em></span>
          </div>`).join('')}
      </div>`).join('');

    const summary = risk.summary || '主要市场数据暂缺';
    $('#marketReadthrough').innerHTML = `<b>外围传导：${escapeHtml(risk.label || '数据暂缺')}</b> · ${escapeHtml(summary)}。关注美元与美债利率对成长股估值的压制。`;
  }

  // -------------------------------------------------------------------------
  // Context-aware research copilot
  // -------------------------------------------------------------------------

  function correctionStorageKey(code) {
    return `${CORRECTION_KEY_PREFIX}${code}`;
  }

  function readStoredCorrections() {
    try {
      const value = JSON.parse(localStorage.getItem(correctionStorageKey(state.code)) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function saveStoredCorrections(value) {
    localStorage.setItem(correctionStorageKey(state.code), JSON.stringify(value));
  }

  function applyStoredCorrections() {
    const stored = readStoredCorrections();
    Object.entries(COPILOT_EDITABLE_FIELDS).forEach(([targetId]) => {
      const element = document.getElementById(targetId);
      if (!element) return;
      const correction = stored[targetId];
      element.classList.toggle('ai-corrected', Boolean(correction));
      if (correction && correction.value) {
        element.textContent = correction.value;
        element.title = `AI 建议修正 · ${correction.reason || '经用户确认'}`;
      } else if (element.title && element.title.startsWith('AI 建议修正')) {
        element.removeAttribute('title');
      }
    });
  }

  function applyCopilotCorrection(correction, button) {
    const meta = COPILOT_EDITABLE_FIELDS[correction.targetId];
    const element = document.getElementById(correction.targetId);
    if (!meta || !element) return;
    const stored = readStoredCorrections();
    if (stored[correction.targetId]) {
      delete stored[correction.targetId];
      saveStoredCorrections(stored);
      renderAll();
      button.textContent = '应用这项修正';
      button.classList.remove('is-applied');
      toast(`已撤销「${meta.label}」的修正`);
      return;
    }
    stored[correction.targetId] = {
      value: String(correction.suggestedValue || '').trim().slice(0, 500),
      original: element.textContent.trim(),
      reason: String(correction.reason || '').trim().slice(0, 300),
      appliedAt: new Date().toISOString(),
    };
    saveStoredCorrections(stored);
    applyStoredCorrections();
    updateCopilotContext();
    button.textContent = '已应用 · 点击撤销';
    button.classList.add('is-applied');
    toast(`已修正「${meta.label}」，刷新后仍会保留`);
  }

  function visibleSectionText(selector, maxLength = 4500) {
    const element = $(selector);
    if (!element) return '';
    return element.innerText.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function buildCopilotContext() {
    const data = state.data || {};
    const quote = data.quote || {};
    const ai = data.ai || {};
    const flow = data.flow || {};
    const reports = data.reports || {};
    const position = readStoredPosition(state.code);
    const positionAdvice = position && state.positionAdvice ? state.positionAdvice : null;
    const price = Number(quote.price);
    const marketValue = position && Number.isFinite(price) ? price * position.shares : null;
    const stored = readStoredCorrections();
    const editableFields = Object.entries(COPILOT_EDITABLE_FIELDS).map(([targetId, meta]) => {
      const element = document.getElementById(targetId);
      return {
        targetId,
        label: meta.label,
        section: meta.section,
        currentValue: element ? element.textContent.trim().slice(0, 500) : '',
        correctedByUser: Boolean(stored[targetId]),
      };
    });
    return {
      stock: {
        code: quote.code,
        name: quote.name,
        market: quote.market,
        industry: quote.industry,
        region: quote.region,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        prevClose: quote.prevClose,
        turnover: quote.turnover,
        volumeRatio: quote.volumeRatio,
        pe: quote.pe,
        pb: quote.pb,
      },
      generatedAt: data.generatedAt,
      tradingDate: data.tradingDate,
      stale: Boolean(data.stale),
      status: data.status,
      analysis: {
        score: ai.composite,
        stance: ai.stance,
        confidence: ai.confidence,
        summary: ai.summary,
        levels: ai.levels,
        conclusions: ai.conclusions,
        factors: ai.factors,
        forecast: ai.forecast,
        risks: ai.risks,
        scenarios: ai.scenarios,
      },
      technical: data.technical,
      capitalFlow: {
        date: flow.date,
        signal: flow.signal,
        tone: flow.tone,
        today: flow.today,
        sum5: flow.sum5,
        sum10: flow.sum10,
        historyAvailable: flow.historyAvailable,
      },
      institutions: {
        count: reports.count,
        orgCount: reports.orgCount,
        positiveRatio: reports.positiveRatio,
        targetPrice: reports.targetPrice,
        targetUpside: reports.targetUpside,
        consensusScore: reports.consensusScore,
        latest: (reports.list || []).slice(0, 8),
      },
      position: position ? {
        hasPosition: true,
        cost: position.cost,
        shares: position.shares,
        capital: position.capital,
        marketValue,
        pnl: Number.isFinite(marketValue) ? marketValue - position.cost * position.shares : null,
        pnlPct: Number.isFinite(price) ? ((price / position.cost) - 1) * 100 : null,
        weightPct: position.capital && Number.isFinite(marketValue) ? (marketValue / position.capital) * 100 : null,
        aiAdvice: positionAdvice ? {
          action: positionAdvice.action,
          confidence: positionAdvice.confidence,
          advice: positionAdvice.advice,
          plan: positionAdvice.plan,
          riskNote: positionAdvice.riskNote,
          stats: positionAdvice.stats,
        } : null,
      } : { hasPosition: false },
      announcements: ((data.announcements && data.announcements.list) || []).slice(0, 10),
      marketRisk: data.markets && data.markets.risk,
      visibleSections: {
        '个股总览': visibleSectionText('#overview', 2000),
        '核心结论': visibleSectionText('#conclusion'),
        '近期走势': visibleSectionText('#trend', 2500),
        '技术面': visibleSectionText('#technical'),
        '资金面': visibleSectionText('#flow'),
        '机构观点': visibleSectionText('#institutions'),
        '公司公告': visibleSectionText('#announcements'),
        '外围市场': visibleSectionText('#global', 2500),
        '我的持仓': visibleSectionText('.position-block', 2500),
      },
      editableFields,
      appliedCorrections: stored,
    };
  }

  function updateCopilotContext() {
    if (!state.data) return;
    const quote = state.data.quote || {};
    const generated = new Date(state.data.generatedAt);
    const storedCount = Object.keys(readStoredCorrections()).length;
    const position = readStoredPosition(state.code);
    $('#copilotContextName').textContent = `${quote.name || '当前个股'} ${quote.code || state.code}`;
    $('#copilotContextTime').textContent = Number.isNaN(generated.getTime())
      ? '页面已同步'
      : `同步 ${generated.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit' })}`;
    const contextParts = ['页面上下文已同步'];
    if (position) contextParts.push(`已读取持仓 ${position.shares.toLocaleString('zh-CN')} 股`);
    if (storedCount) contextParts.push(`${storedCount} 项修正`);
    $('#copilotMode').textContent = contextParts.join(' · ');
  }

  function appendCopilotMessage(role, payload) {
    const log = $('#copilotMessages');
    const article = document.createElement('article');
    article.className = `copilot-message ${role}`;
    if (payload.loading) article.classList.add('is-loading');
    if (role === 'assistant') {
      const avatar = document.createElement('span');
      avatar.className = 'copilot-avatar';
      avatar.textContent = 'AI';
      article.appendChild(avatar);
    }
    const bubble = document.createElement('div');
    bubble.className = 'copilot-bubble';
    const text = document.createElement('p');
    text.textContent = payload.answer || '';
    bubble.appendChild(text);

    if (Array.isArray(payload.citations) && payload.citations.length) {
      const citations = document.createElement('div');
      citations.className = 'copilot-citations';
      payload.citations.slice(0, 6).forEach((citation) => {
        const chip = document.createElement('span');
        chip.textContent = `依据 · ${citation}`;
        citations.appendChild(chip);
      });
      bubble.appendChild(citations);
    }

    if (role === 'assistant' && Array.isArray(payload.corrections)) {
      payload.corrections.slice(0, 4).forEach((correction) => {
        const meta = COPILOT_EDITABLE_FIELDS[correction.targetId];
        if (!meta || !correction.suggestedValue) return;
        const card = document.createElement('div');
        card.className = 'copilot-correction';
        const label = document.createElement('span');
        label.textContent = `建议修正 · ${meta.label}`;
        const before = document.createElement('b');
        before.textContent = `原：${correction.currentValue || document.getElementById(correction.targetId)?.textContent || '—'}`;
        const after = document.createElement('em');
        after.textContent = `改：${correction.suggestedValue}`;
        const reason = document.createElement('small');
        reason.textContent = correction.reason || '与页面其他数据存在不一致';
        const button = document.createElement('button');
        button.type = 'button';
        const applied = Boolean(readStoredCorrections()[correction.targetId]);
        button.textContent = applied ? '已应用 · 点击撤销' : '应用这项修正';
        button.classList.toggle('is-applied', applied);
        button.addEventListener('click', () => applyCopilotCorrection(correction, button));
        card.append(label, before, after, reason, button);
        bubble.appendChild(card);
      });
    }
    article.appendChild(bubble);
    log.appendChild(article);
    log.scrollTop = log.scrollHeight;
    return article;
  }

  function resetCopilotConversation() {
    state.copilotSeq += 1;
    state.copilotBusy = false;
    state.copilotHistory = [];
    const log = $('#copilotMessages');
    if (!log) return;
    $('#copilotSend').disabled = false;
    log.innerHTML = '';
    appendCopilotMessage('assistant', {
      answer: '已切换个股。我会自动读取新页面的行情、走势、资金、研报与公告；发现疑点时会先给出修正建议。',
    });
  }

  function setCopilotOpen(open) {
    const panel = $('#researchCopilot');
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    $('#copilotToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) setTimeout(() => $('#copilotInput').focus(), 50);
  }

  function bindCopilotResize(wideMedia) {
    const resizer = $('#copilotResizer');
    const panel = $('#researchCopilot');
    if (!resizer || !panel) return;

    const widthBounds = () => ({
      min: 360,
      max: Math.max(360, Math.min(window.innerWidth * 0.55, window.innerWidth - 888)),
    });
    const updateAria = (width) => {
      const bounds = widthBounds();
      resizer.setAttribute('aria-valuemin', String(Math.round((bounds.min / window.innerWidth) * 100)));
      resizer.setAttribute('aria-valuemax', String(Math.round((bounds.max / window.innerWidth) * 100)));
      resizer.setAttribute('aria-valuenow', String(Math.round((width / window.innerWidth) * 100)));
      resizer.setAttribute('aria-valuetext', `AI 投研助手占页面宽度 ${Math.round((width / window.innerWidth) * 100)}%`);
    };
    const setWidth = (requestedWidth, persist = false) => {
      const bounds = widthBounds();
      const width = clamp(requestedWidth, bounds.min, bounds.max);
      document.documentElement.style.setProperty('--copilot-width', `${Math.round(width)}px`);
      updateAria(width);
      if (persist) {
        try {
          localStorage.setItem(COPILOT_WIDTH_KEY, String(width / window.innerWidth));
        } catch (_) {
          // 浏览器禁用本地存储时，拖拽仍然可以正常使用。
        }
      }
      return width;
    };
    const storedRatio = (() => {
      try {
        const value = Number(localStorage.getItem(COPILOT_WIDTH_KEY));
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_COPILOT_RATIO;
      } catch (_) {
        return DEFAULT_COPILOT_RATIO;
      }
    })();
    let currentRatio = storedRatio;
    let dragging = false;

    const applyRatio = () => {
      if (!wideMedia.matches) return;
      const width = setWidth(window.innerWidth * currentRatio);
      currentRatio = width / window.innerWidth;
    };
    applyRatio();

    resizer.addEventListener('pointerdown', (event) => {
      if (!wideMedia.matches || event.button !== 0) return;
      dragging = true;
      resizer.setPointerCapture(event.pointerId);
      document.body.classList.add('is-copilot-resizing');
      event.preventDefault();
    });
    resizer.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const width = setWidth(window.innerWidth - event.clientX - 14);
      currentRatio = width / window.innerWidth;
    });
    const finishResize = (event) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('is-copilot-resizing');
      if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
      const width = panel.getBoundingClientRect().width;
      currentRatio = width / window.innerWidth;
      setWidth(width, true);
    };
    resizer.addEventListener('pointerup', finishResize);
    resizer.addEventListener('pointercancel', finishResize);
    resizer.addEventListener('dblclick', () => {
      currentRatio = DEFAULT_COPILOT_RATIO;
      setWidth(window.innerWidth * currentRatio, true);
    });
    resizer.addEventListener('keydown', (event) => {
      if (!wideMedia.matches) return;
      const bounds = widthBounds();
      const currentWidth = panel.getBoundingClientRect().width;
      const step = event.shiftKey ? 48 : 16;
      let nextWidth = currentWidth;
      if (event.key === 'ArrowLeft') nextWidth += step;
      else if (event.key === 'ArrowRight') nextWidth -= step;
      else if (event.key === 'Home') nextWidth = bounds.min;
      else if (event.key === 'End') nextWidth = bounds.max;
      else return;
      event.preventDefault();
      const width = setWidth(nextWidth, true);
      currentRatio = width / window.innerWidth;
    });
    window.addEventListener('resize', applyRatio);
  }

  async function askCopilot(question) {
    const cleanQuestion = String(question || '').trim();
    if (!cleanQuestion || state.copilotBusy || !state.data) return;
    setCopilotOpen(true);
    appendCopilotMessage('user', { answer: cleanQuestion });
    state.copilotHistory.push({ role: 'user', content: cleanQuestion });
    const loading = appendCopilotMessage('assistant', { answer: '正在核对当前页面与数据…', loading: true });
    const requestSeq = ++state.copilotSeq;
    state.copilotBusy = true;
    $('#copilotSend').disabled = true;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: cleanQuestion,
          messages: state.copilotHistory.slice(-8),
          context: buildCopilotContext(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'AI 服务暂时不可用');
      if (requestSeq !== state.copilotSeq) return;
      loading.remove();
      appendCopilotMessage('assistant', payload);
      state.copilotHistory.push({ role: 'assistant', content: payload.answer || '' });
      state.copilotHistory = state.copilotHistory.slice(-10);
      $('#copilotMode').textContent = payload.mode === 'cloud'
        ? '云端模型 · 当前页面上下文'
        : '本地分析 · 当前页面上下文';
    } catch (error) {
      if (requestSeq !== state.copilotSeq) return;
      loading.remove();
      appendCopilotMessage('assistant', { answer: `${error.message || 'AI 服务暂时不可用'}。你可以稍后重试，页面原有数据不会受影响。` });
    } finally {
      if (requestSeq === state.copilotSeq) {
        state.copilotBusy = false;
        $('#copilotSend').disabled = false;
        $('#copilotInput').focus();
      }
    }
  }

  function bindCopilot() {
    const wideMedia = window.matchMedia('(min-width: 1640px)');
    bindCopilotResize(wideMedia);
    const syncCopilotVisibility = () => {
      const panel = $('#researchCopilot');
      if (wideMedia.matches) {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'false');
        $('#copilotToggle').setAttribute('aria-expanded', 'true');
      } else if (!panel.classList.contains('is-open')) {
        panel.setAttribute('aria-hidden', 'true');
        $('#copilotToggle').setAttribute('aria-expanded', 'false');
      }
    };
    syncCopilotVisibility();
    if (wideMedia.addEventListener) wideMedia.addEventListener('change', syncCopilotVisibility);
    else if (wideMedia.addListener) wideMedia.addListener(syncCopilotVisibility);
    $('#copilotToggle').addEventListener('click', () => setCopilotOpen(true));
    $('#copilotClose').addEventListener('click', () => setCopilotOpen(false));
    $('#copilotQuick').addEventListener('click', (event) => {
      const button = event.target.closest('[data-question]');
      if (button) askCopilot(button.dataset.question);
    });
    $('#copilotForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#copilotInput');
      const question = input.value;
      input.value = '';
      askCopilot(question);
    });
    $('#copilotInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('#copilotForm').requestSubmit();
      }
    });
  }

  function renderAi() {
    const ai = state.data.ai;
    const tone = ai.stanceKey === 'bull' || ai.stanceKey === 'lean-bull'
      ? '#d5e97a'
      : ai.stanceKey === 'bear' || ai.stanceKey === 'lean-bear' ? '#e7a28f' : '#e7d596';
    $('#aiScoreRing').style.setProperty('--score', ai.composite);
    $('#aiScoreRing').style.setProperty('--ring', tone);
    $('#aiScore').textContent = ai.composite;
    $('#aiStance').textContent = ai.stance;
    $('#aiStance').style.color = tone;
    $('#aiConfidence').textContent = `${ai.confidence}%`;
    $('#confidenceFill').style.width = `${ai.confidence}%`;
    $('#aiSummary').textContent = aiDriverSummary(ai);

    const factors = ['trend', 'capital', 'institution'].map((key) => ai.factors.find((f) => f.key === key)).filter(Boolean);
    $('#aiFactors').innerHTML = factors.map((factor) => `
      <div class="ai-factor"><span>${escapeHtml(factor.label)}</span><i><b style="width:${clamp(factor.score, 2, 98)}%"></b></i><em>${factor.score}</em></div>`).join('');
    const validFactors = (ai.factors || []).filter((factor) => Number.isFinite(Number(factor.score)));
    const positiveFactors = validFactors.filter((factor) => Number(factor.score) >= 60).length;
    const weakFactors = validFactors.filter((factor) => Number(factor.score) < 45).length;
    $('#aiLevels').innerHTML = `
      <div><span>有效因子</span><b>${validFactors.length}</b></div>
      <div><span>偏强因子</span><b>${positiveFactors}</b></div>
      <div><span>偏弱因子</span><b>${weakFactors}</b></div>`;

    const r = state.data.reports;
    $('#miniConsensus').textContent = r.consensusScore ?? '—';
    $('#miniConsensusLabel').textContent = r.consensusScore >= 70 ? '偏正面' : r.consensusScore >= 50 ? '中性' : r.count ? '偏谨慎' : '暂无';
    $('#miniConsensusLabel').className = r.consensusScore >= 70 ? 'up' : r.consensusScore >= 50 ? '' : 'down';
    $('#miniPositive').textContent = r.count ? `${r.positiveRatio}%` : '—';
    $('#miniUpside').textContent = r.targetUpside != null ? fmtPct(r.targetUpside) : '—';
    $('#miniCoverage').textContent = r.count ? `${r.count} 篇 / ${r.orgCount} 家` : '—';
  }

  function renderSources() {
    const generated = new Date(state.data.generatedAt);
    const diff = Math.max(0, Math.round((Date.now() - generated.getTime()) / 1000));
    const relative = diff < 30 ? '刚刚' : diff < 60 ? `${diff} 秒前` : `${Math.round(diff / 60)} 分钟前`;
    $('#sourceFreshness').textContent = state.data.stale
      ? '快照数据 · 上游暂时不可用'
      : `更新于 ${generated.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })} · ${relative}`;
    const providers = state.data.providers || {};
    if ($('#srcQuote')) $('#srcQuote').textContent = providers.quote === 'tencent' ? '腾讯' : '东方财富';
    if ($('#srcResearch')) $('#srcResearch').textContent = providers.flow === 'sina' || providers.flow === 'eastmoney+sina' ? '东财 / 新浪' : '东方财富';
    if ($('#srcGlobal')) $('#srcGlobal').textContent = providers.markets === 'fallback' ? '腾讯 / 新浪' : '东方财富';
    const quoteSource = state.data.source && state.data.source.quote;
    if (quoteSource && !state.data.stale) $('#sourceLabel').textContent = quoteSource.replace(' · 实时行情', '').replace(' · 实时', '');
  }

  function openDialog() {
    if (!state.data) return;
    const ai = state.data.ai;
    $('#dialogScore').textContent = ai.composite;
    $('#dialogStance').textContent = ai.stance;
    $('#dialogConfidence').textContent = `${ai.confidence}%`;
    $('#dialogFactors').innerHTML = ai.factors.map((factor) => `
      <div class="factor-table-row">
        <span>${escapeHtml(factor.label)}</span>
        <b>${factor.score}</b>
        <p>${escapeHtml(factor.note)}</p>
      </div>`).join('');
    $('#dialogScenarios').innerHTML = ai.scenarios.map((scenario) => `
      <div class="scenario-item ${escapeHtml(scenario.type)}">
        <span>${escapeHtml(scenario.label)}</span>
        <p>${escapeHtml(scenario.text)}</p>
      </div>`).join('');
    $('#dialogRisks').innerHTML = ai.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('');
    const dialog = $('#aiDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog() {
    const dialog = $('#aiDialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function renderFatalError(message) {
    $('#heroLoading').classList.add('is-hidden');
    $('#chartLoading').classList.add('is-hidden');
    $('#stockName').textContent = '数据加载失败';
    $('#stockPrice').textContent = '—';
    $('#quoteStatus').textContent = message || '请检查网络后重试';
    $('#aiSummary').textContent = '暂时无法生成研判。请点击右上角刷新按钮重试，或更换股票。';
  }

  // -------------------------------------------------------------------------
  // Navigation, dialog, refresh, boot
  // -------------------------------------------------------------------------

  function bindNavigation() {
    const links = $$('.nav-link');
    const sectionLinks = links.filter((link) => link.getAttribute('href').startsWith('#'));
    const sections = sectionLinks.map((link) => $(link.getAttribute('href'))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        sectionLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-128px 0px -65% 0px', threshold: 0 });

    sections.forEach((section) => observer.observe(section));

    sectionLinks.forEach((link) => {
      link.addEventListener('click', () => {
        sectionLinks.forEach((l) => l.classList.toggle('active', l === link));
      });
    });
  }

  function layoutAiCard() {
    const card = $('#aiCard');
    const rail = $('.insight-rail');
    const overview = $('#overview');
    if (!card || !rail || !overview) return;
    const mobile = window.matchMedia('(max-width: 1120px)').matches;
    if (mobile && card.parentElement !== overview.parentElement) {
      overview.insertAdjacentElement('afterend', card);
    } else if (!mobile && card.parentElement !== rail) {
      rail.prepend(card);
    }
  }

  function forwardTagNav(selector, target) {
    const element = $(selector);
    if (!element) return;
    const go = () => {
      const section = $(target);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    element.addEventListener('click', go);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        go();
      }
    });
  }

  function bindControls() {
    const aiTag = $('#heroAiTag');
    aiTag.addEventListener('click', openDialog);
    aiTag.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDialog();
      }
    });
    forwardTagNav('#heroFlowTag', '#flow');
    forwardTagNav('#heroReportTag', '#institutions');

    $('#rangeTabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-range]');
      if (!button || button.dataset.range === state.range) return;
      state.range = button.dataset.range;
      $$('#rangeTabs button').forEach((b) => b.classList.toggle('active', b === button));
      updateChart();
      renderTrend();
    });

    $('#refreshBtn').addEventListener('click', () => {
      if (state.loading) return;
      loadStock(state.code, { refresh: true });
      toast('正在刷新行情、资金与研报数据');
    });

    $('#starBtn').addEventListener('click', toggleWatch);
    $('#aiDetailBtn').addEventListener('click', openDialog);
    $('#closeDialogBtn').addEventListener('click', closeDialog);
    $('#aiDialog').addEventListener('click', (event) => {
      if (event.target === $('#aiDialog')) closeDialog();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && $('#aiDialog').open) closeDialog();
      if (event.key === 'Escape' && $('#researchCopilot').classList.contains('is-open')) setCopilotOpen(false);
    });
  }

  function startAutoRefresh() {
    state.autoTimer = setInterval(() => {
      if (document.hidden || state.loading) return;
      if (state.data && state.data.status && state.data.status.state === 'open') {
        loadStock(state.code, { silent: true });
      }
    }, 90_000);
  }

  function boot() {
    updateClock();
    setInterval(updateClock, 1000);
    bindSearch();
    bindWatchlistEvents();
    bindNavigation();
    bindControls();
    bindPosition();
    bindCopilot();
    layoutAiCard();
    const layoutMedia = window.matchMedia('(max-width: 1120px)');
    if (layoutMedia.addEventListener) layoutMedia.addEventListener('change', layoutAiCard);
    else if (layoutMedia.addListener) layoutMedia.addListener(layoutAiCard);
    updateStar();
    refreshWatchlist();
    loadStock(state.code);
    startAutoRefresh();
    setTimeout(() => {
      if (state.data) renderSources();
    }, 30_000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
