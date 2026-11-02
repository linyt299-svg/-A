/* 观澜投研 · 趋势后续票 */
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = { loading: false, searchTimer: null, searchFocus: -1, toastTimer: null };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function finite(value) { return Number.isFinite(Number(value)); }
  function num(value, fallback = 0) { return finite(value) ? Number(value) : fallback; }
  function tone(value) { return num(value) > 0 ? 'up' : num(value) < 0 ? 'down' : 'neutral'; }
  function fmtPrice(value) { return finite(value) ? Number(value).toFixed(2) : '—'; }
  function fmtPct(value) {
    if (!finite(value)) return '—';
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }
  function formatTime(date = new Date()) {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
  }

  function updateClock() {
    const now = new Date();
    $('#clock').textContent = formatTime(now);
    $('#today').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now).replaceAll('/', '.');
  }

  function setLoading(loading) {
    state.loading = loading;
    const bar = $('#loadingBar');
    const button = $('#trendRefreshBtn');
    bar.classList.toggle('is-loading', loading);
    button.classList.toggle('is-loading', loading);
    button.disabled = loading;
    if (!loading) {
      bar.classList.add('is-done');
      window.setTimeout(() => bar.classList.remove('is-done'), 520);
    }
  }

  function toast(message, isError = false) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => element.classList.remove('show'), 2600);
  }

  function renderStatus(status) {
    const current = status || { state: 'closed', label: '状态未知', detail: '沪深市场' };
    const root = $('#marketState');
    root.className = `market-state ${current.state === 'open' ? 'is-open' : ''}`;
    root.innerHTML = `<span class="status-dot"></span><span class="market-state-copy"><b>${escapeHtml(current.label)}</b><small>${escapeHtml(current.detail)}</small></span>`;
  }

  function renderCard(stock, index) {
    const reasons = Array.isArray(stock.reasons) ? stock.reasons : [];
    const tags = [stock.signal, ...reasons].filter(Boolean).slice(0, 4);
    return `
      <article class="trend-full-card">
        <div class="trend-full-name">
          <a href="/?code=${encodeURIComponent(stock.code)}">${escapeHtml(stock.name)}</a>
          <small>${escapeHtml(stock.code)} · ${fmtPrice(stock.price)} · <span class="${tone(stock.changePct)}">${fmtPct(stock.changePct)}</span></small>
        </div>
        <div class="trend-full-evidence">
          <div class="trend-full-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
          <p title="${escapeHtml(stock.invalidation)}">失效观察：${escapeHtml(stock.invalidation || '等待更多行情确认')} · 风险 ${escapeHtml(stock.risk || '—')}</p>
        </div>
        <div class="trend-full-score"><small>第 ${stock.rank || index + 1} 名</small><b>${Math.round(num(stock.score))}</b><em>置信 ${Math.round(num(stock.confidence))}%</em></div>
      </article>`;
  }

  function renderList(selector, items, emptyText) {
    const root = $(selector);
    root.innerHTML = Array.isArray(items) && items.length
      ? items.map((stock, index) => renderCard(stock, index)).join('')
      : `<div class="market-empty">${escapeHtml(emptyText)}</div>`;
  }

  function render(data) {
    const intraday = (data.stocks && data.stocks.intraday) || [];
    const tomorrow = (data.stocks && data.stocks.tomorrow) || [];
    const coverage = data.coverage || {};
    const totalMarket = num(coverage.totalMarket || (data.market && data.market.validCount));
    const next = data.pulse && data.pulse.nextTradingDay;
    renderStatus(data.status);
    renderList('#intradayGrid', intraday, '本轮分析没有达到门槛的日内趋势候选');
    renderList('#tomorrowGrid', tomorrow, '本轮分析没有达到门槛的后续观察候选');
    $('#intradayTotal').textContent = intraday.length.toLocaleString('zh-CN');
    $('#tomorrowTotal').textContent = tomorrow.length.toLocaleString('zh-CN');
    $('#intradayCount').textContent = `${intraday.length} 只入围`;
    $('#tomorrowCount').textContent = `${tomorrow.length} 只入围`;
    if (next) {
      $('#tomorrowDate').textContent = `${next.short} ${next.weekday}`;
      $('#tomorrowTitle').textContent = `${next.label}观察票`;
    }
    const marketLabel = totalMarket ? `全市场 ${totalMarket.toLocaleString('zh-CN')} 只` : '全市场 A 股';
    $('#coverageSummary').textContent = `${marketLabel} · 活跃样本 ${num(coverage.stockPool)} 只 · 当前共 ${intraday.length + tomorrow.length} 条合格结果`;
    $('#methodText').textContent = data.methodology && data.methodology.scoreDescription
      ? data.methodology.scoreDescription
      : '候选来自活跃样本池的多因子分析，只有达到分数和资金门槛的股票才会展示。';
    const generated = data.generatedAt ? new Date(data.generatedAt) : new Date();
    $('#updateTime').textContent = formatTime(generated);
    $('#sourceLabel').textContent = data.stale ? '最近成功快照' : '东方财富 / 新浪公开数据';
  }

  async function load({ refresh = false } = {}) {
    if (state.loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/market-overview${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '趋势候选加载失败');
      render(payload);
      if (refresh) toast('趋势候选已更新');
    } catch (error) {
      toast(error.message || '趋势候选加载失败', true);
      $('#coverageSummary').textContent = '数据暂时无法连接，请稍后刷新';
    } finally {
      setLoading(false);
    }
  }

  function bindFilters() {
    $$('.trend-filter-button').forEach((button) => button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      $$('.trend-filter-button').forEach((item) => item.classList.toggle('active', item === button));
      $$('.trend-full-section').forEach((section) => {
        section.hidden = filter !== 'all' && section.dataset.kind !== filter;
      });
    }));
  }

  function bindSearch() {
    const input = $('#stockSearch');
    const results = $('#searchResults');
    const select = (code) => {
      const match = String(code || '').match(/\d{6}/);
      if (match) window.location.href = `/?code=${encodeURIComponent(match[0])}`;
    };
    const perform = async (query) => {
      results.hidden = false;
      results.innerHTML = '<div class="search-empty">正在搜索…</div>';
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        if (query !== input.value.trim()) return;
        const items = payload.items || [];
        results.innerHTML = items.length ? `
          <div class="search-results-head"><span>进入个股研究</span><span>${items.length} 只</span></div>
          ${items.map((item, index) => `<button class="search-result${index === 0 ? ' is-focused' : ''}" type="button" data-code="${escapeHtml(item.code)}"><span class="result-code">${escapeHtml(item.code)}</span><span class="result-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.industry || 'A 股')}</small></span><span class="result-market">${escapeHtml(item.market || '')}</span></button>`).join('')}`
          : `<div class="search-empty">没有找到“${escapeHtml(query)}”对应的 A 股</div>`;
        state.searchFocus = items.length ? 0 : -1;
      } catch {
        results.innerHTML = '<div class="search-empty">搜索服务暂不可用，可直接输入 6 位代码</div>';
      }
    };
    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(state.searchTimer);
      if (!query) { results.hidden = true; return; }
      state.searchTimer = window.setTimeout(() => perform(query), 220);
    });
    input.addEventListener('keydown', (event) => {
      const buttons = $$('.search-result', results);
      if (event.key === 'ArrowDown' && buttons.length) { event.preventDefault(); state.searchFocus = (state.searchFocus + 1) % buttons.length; }
      else if (event.key === 'ArrowUp' && buttons.length) { event.preventDefault(); state.searchFocus = (state.searchFocus - 1 + buttons.length) % buttons.length; }
      else if (event.key === 'Enter') {
        const button = buttons[state.searchFocus] || buttons[0];
        if (button) { event.preventDefault(); select(button.dataset.code); } else select(input.value);
      } else if (event.key === 'Escape') results.hidden = true;
      buttons.forEach((button, index) => button.classList.toggle('is-focused', index === state.searchFocus));
    });
    results.addEventListener('click', (event) => {
      const button = event.target.closest('.search-result');
      if (button) select(button.dataset.code);
    });
    document.addEventListener('click', (event) => { if (!event.target.closest('#searchShell')) results.hidden = true; });
    document.addEventListener('keydown', (event) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
      if (event.key === '/' && !typing) { event.preventDefault(); input.focus(); }
    });
  }

  function boot() {
    updateClock();
    window.setInterval(updateClock, 1000);
    bindFilters();
    bindSearch();
    $('#trendRefreshBtn').addEventListener('click', () => load({ refresh: true }));
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
