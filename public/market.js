/* 观澜投研 · 市场全景 */
(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    data: null,
    loading: false,
    requestSeq: 0,
    searchTimer: null,
    searchFocus: -1,
    toastTimer: null,
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function finite(value) {
    return Number.isFinite(Number(value));
  }

  function num(value, fallback = 0) {
    return finite(value) ? Number(value) : fallback;
  }

  function fmtPrice(value) {
    return finite(value) ? Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  }

  function fmtPct(value) {
    if (!finite(value)) return '—';
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }

  function fmtMoney(value, signed = false) {
    if (!finite(value)) return '—';
    const n = Number(value);
    const sign = signed && n > 0 ? '+' : '';
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${sign}${(n / 1e12).toFixed(2)}万亿`;
    if (abs >= 1e8) return `${sign}${(n / 1e8).toFixed(2)}亿`;
    if (abs >= 1e4) return `${sign}${(n / 1e4).toFixed(1)}万`;
    return `${sign}${Math.round(n).toLocaleString('zh-CN')}`;
  }

  function toneClass(value) {
    return num(value) > 0 ? 'up' : num(value) < 0 ? 'down' : 'neutral';
  }

  function colorForScore(score) {
    if (score >= 58) return '#c45345';
    if (score < 43) return '#23826a';
    return '#b28039';
  }

  // The breadth board already owns the market counts and percentages. Keep
  // the hero copy focused on what the current breadth means for the reader.
  function marketGuidance(market) {
    if (market.dataSource === 'indices') {
      return '全市场广度暂缺，当前信号仅来自主要指数，暂不据此判断个股赚钱效应。';
    }
    if (finite(market.indexAverage) && finite(market.median)) {
      const indexAverage = Number(market.indexAverage);
      const median = Number(market.median);
      if (indexAverage > 0.15 && median < 0) return '指数表现强于多数个股，权重与个股明显背离，追涨前先看扩散能否修复。';
      if (indexAverage < -0.15 && median > 0) return '多数个股表现好于指数，结构性机会仍在，指数拖累下宜关注承接强度。';
    }
    const upRatio = num(market.upRatio, 50);
    if (upRatio >= 60) return '上涨正在向更多个股扩散，可优先跟踪有量能与资金确认的强势方向。';
    if (upRatio <= 40) return '下跌扩散至多数个股，短线先控制回撤，等待广度与中位数同步修复。';
    return '市场处于分化阶段，指数方向不足以代表个股，宜按板块强弱与资金持续性筛选。';
  }

  function formatShanghaiTime(date = new Date()) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date);
  }

  function formatShanghaiMinute(date = new Date()) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  }

  function updateClock() {
    const now = new Date();
    $('#clock').textContent = formatShanghaiTime(now);
    $('#today').textContent = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).format(now).replaceAll('/', '.');
  }

  function setLoading(loading) {
    state.loading = loading;
    const bar = $('#loadingBar');
    const button = $('#marketRefreshBtn');
    bar.classList.toggle('is-loading', loading);
    button.classList.toggle('is-loading', loading);
    button.disabled = loading;
    if (!loading) {
      bar.classList.remove('is-loading');
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
    const root = $('#marketState');
    const badge = $('#marketSession');
    const current = status || { state: 'closed', label: '状态未知', detail: '沪深市场' };
    root.className = `market-state ${current.state === 'open' ? 'is-open' : ''}`;
    root.innerHTML = `<span class="status-dot"></span><span class="market-state-copy"><b>${escapeHtml(current.label)}</b><small>${escapeHtml(current.detail)}</small></span>`;
    badge.textContent = current.label;
    badge.classList.toggle('is-open', current.state === 'open');
  }

  function renderHero(data) {
    const market = data.market || {};
    const score = finite(market.score) ? Number(market.score) : 50;
    const ring = $('#marketScoreRing');
    ring.style.setProperty('--pulse-score', score);
    ring.style.setProperty('--pulse-color', colorForScore(score));
    $('#marketScore').textContent = finite(market.score) ? Math.round(score) : '—';
    $('#marketVerdict').textContent = market.label || '数据不足';
    $('#marketVerdict').className = market.tone || 'neutral';
    $('#marketSummary').textContent = marketGuidance(market);
    $('#rotationLabel').textContent = `${data.pulse && data.pulse.rotation ? data.pulse.rotation : '市场脉搏'} · MARKET PULSE`;
    $('#pulseHeadline').textContent = data.pulse && data.pulse.headline ? data.pulse.headline : '热点方向仍在识别';
    const pulseSummary = data.pulse && data.pulse.summary;
    $('#pulseDetail').textContent = pulseSummary && pulseSummary !== (market.analysis && market.analysis.detail)
      ? pulseSummary
      : '热点数据暂缺，当前不对主线方向作额外判断。';

    const up = num(market.up);
    const flat = num(market.flat);
    const down = num(market.down);
    const total = up + flat + down;
    $('#breadthUp').textContent = up ? up.toLocaleString('zh-CN') : '—';
    $('#breadthFlat').textContent = finite(market.flat) ? flat.toLocaleString('zh-CN') : '—';
    $('#breadthDown').textContent = down ? down.toLocaleString('zh-CN') : '—';
    $('#breadthCoverage').textContent = market.dataSource === 'indices' ? '主要指数样本' : `覆盖 ${num(market.validCount).toLocaleString('zh-CN')} 只`;
    $('#upSegment').style.width = `${total ? (up / total) * 100 : 33.33}%`;
    $('#flatSegment').style.width = `${total ? (flat / total) * 100 : 33.33}%`;
    $('#downSegment').style.width = `${total ? (down / total) * 100 : 33.33}%`;
    $('#breadthNote').textContent = `上涨占比 ${finite(market.upRatio) ? `${market.upRatio}%` : '—'} · 个股中位数 ${fmtPct(market.median)}`;
  }

  function renderIndices(indices) {
    const root = $('#indexStrip');
    if (!Array.isArray(indices) || !indices.length) {
      root.innerHTML = '<div class="market-empty">主要指数暂时不可用</div>';
      return;
    }
    root.innerHTML = indices.slice(0, 4).map((item) => `
      <div class="market-index-card">
        <span>${escapeHtml(item.name)}</span>
        <b>${finite(item.value) ? Number(item.value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</b>
        <em class="${toneClass(item.pct)}">${fmtPct(item.pct)}</em>
      </div>`).join('');
  }

  function renderHotspots(items) {
    const root = $('#hotspotGrid');
    if (!Array.isArray(items) || !items.length) {
      root.innerHTML = '<div class="market-empty">概念热点数据暂时不可用</div>';
      return;
    }
    root.innerHTML = items.slice(0, 6).map((item) => {
      const leader = item.leaderCode
        ? `<a href="/?code=${encodeURIComponent(item.leaderCode)}" title="进入个股研究">${escapeHtml(item.leader)}</a>`
        : `<span>${escapeHtml(item.leader || '—')}</span>`;
      return `
        <article class="hotspot-card" style="--heat-width:${Math.max(12, num(item.heat, 50))}%">
          <div class="hotspot-rank"><span>TOP ${String(item.rank).padStart(2, '0')}</span><em>${fmtPct(item.changePct)}</em></div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${leader}<span>${finite(item.breadth) ? `${item.breadth}% 个股上涨` : `${num(item.up)} 涨 / ${num(item.down)} 跌`}</span></p>
        </article>`;
    }).join('');
  }

  function renderSectors(items) {
    const root = $('#sectorList');
    if (!Array.isArray(items) || !items.length) {
      root.innerHTML = '<div class="market-empty">行业板块数据暂时不可用</div>';
      return;
    }
    root.innerHTML = items.slice(0, 9).map((item, index) => `
      <div class="sector-row">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <b>${escapeHtml(item.name)}</b>
        <div class="sector-strength" title="热度 ${num(item.heat)}"><i style="width:${Math.max(8, num(item.heat, 45))}%"></i></div>
        <small>${finite(item.breadth) ? `${item.breadth}%↑` : `${num(item.up)}/${num(item.down)}`}</small>
        <em class="${toneClass(item.changePct)}">${fmtPct(item.changePct)}</em>
      </div>`).join('');
  }

  function renderHotStocks(items, emptyText = '热门股票数据暂时不可用') {
    const body = $('#hotStockBody');
    if (!Array.isArray(items) || !items.length) {
      body.innerHTML = `<tr><td colspan="9"><div class="market-empty">${escapeHtml(emptyText)}</div></td></tr>`;
      return;
    }
    body.innerHTML = items.slice(0, 10).map((stock) => `
      <tr>
        <td><span class="heat-score">${Math.round(num(stock.score))}</span></td>
        <td><span class="stock-name-cell"><b>${escapeHtml(stock.name)}</b><small>${escapeHtml(stock.code)} · ${escapeHtml(stock.market)}</small></span></td>
        <td>${fmtPrice(stock.price)}</td>
        <td class="${toneClass(stock.changePct)}">${fmtPct(stock.changePct)}</td>
        <td>${fmtMoney(stock.amount)}</td>
        <td>${finite(stock.turnover) ? `${Number(stock.turnover).toFixed(2)}%` : '—'}</td>
        <td class="${toneClass(stock.mainNet)}">${fmtMoney(stock.mainNet, true)}</td>
        <td>${escapeHtml(stock.industry || '—')}</td>
        <td><a class="stock-detail-link" href="/?code=${encodeURIComponent(stock.code)}" title="查看个股研究"><svg class="icon"><use href="#i-arrow-up-right"/></svg></a></td>
      </tr>`).join('');
  }

  function renderCandidate(stock, index) {
    const tags = (stock.reasons || []).map((reason) => `<span>${escapeHtml(reason)}</span>`).join('');
    return `
      <div class="trend-candidate">
        <div class="candidate-name">
          <a href="/?code=${encodeURIComponent(stock.code)}">${escapeHtml(stock.name)}</a>
          <small>${escapeHtml(stock.code)} · ${fmtPrice(stock.price)} · <span class="${toneClass(stock.changePct)}">${fmtPct(stock.changePct)}</span></small>
        </div>
        <div class="candidate-evidence">
          <div class="candidate-tags"><span>${escapeHtml(stock.signal)}</span>${tags}</div>
          <p title="${escapeHtml(stock.invalidation)}">失效观察：${escapeHtml(stock.invalidation)} · 风险 ${escapeHtml(stock.risk)}</p>
        </div>
        <div class="candidate-score">
          <span class="candidate-rank">第 ${stock.rank || index + 1} 名</span>
          <b>${Math.round(num(stock.score))}</b>
          <span>日内动能分</span>
          <span>置信 ${Math.round(num(stock.confidence))}%</span>
        </div>
      </div>`;
  }

  function renderTrendList(selector, items, emptyText) {
    const root = $(selector);
    root.innerHTML = Array.isArray(items) && items.length
      ? items.slice(0, 5).map((stock, index) => renderCandidate(stock, index)).join('')
      : `<div class="market-empty">${escapeHtml(emptyText)}</div>`;
  }

  function renderMeta(data) {
    const generated = data.generatedAt ? new Date(data.generatedAt) : new Date();
    const coverage = data.coverage || {};
    const stockQuality = data.dataQuality && data.dataQuality.stocks || {};
    const stocksDegraded = stockQuality.complete === false;
    const stockSnapshot = stocksDegraded && data.stockSnapshotAt ? new Date(data.stockSnapshotAt) : null;
    const totalMarket = num(coverage.totalMarket || (data.market && data.market.validCount));
    const fullMarketText = totalMarket ? `全市场 ${totalMarket.toLocaleString('zh-CN')} 只` : '全市场 A 股';
    $('#updateTime').textContent = formatShanghaiTime(generated);
    $('#freshnessText').textContent = data.stale
      ? `快照数据 · ${data.staleReason || '上游暂不可用'}`
      : stockSnapshot
        ? `其他行情 ${formatShanghaiMinute(generated)} 更新 · 股票榜快照 ${formatShanghaiMinute(stockSnapshot)}`
        : `${formatShanghaiTime(generated)} 更新 · 行情可能延时`;
    $('#coverageText').textContent = `${fullMarketText} · 从 ${num(coverage.stockPool)} 只活跃样本筛选 · 跟踪 ${num(coverage.conceptCount)} 个概念`;
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    if (stocksDegraded && stockSnapshot) {
      $('#warningText').textContent = `股票榜数据源已降级 · 当前展示 ${formatShanghaiMinute(stockSnapshot)} 的最后完整评分；指数、行业等其他行情仍在实时更新`;
      $('#stockCoverage').textContent = `${fullMarketText} · 聚焦 ${num(coverage.stockPool)} 只快照样本`;
      $('#sourceLabel').textContent = '最后完整快照 · 东方财富';
    } else if (stocksDegraded) {
      $('#warningText').textContent = stockQuality.reason || '股票榜数据源已降级，评分暂停';
      $('#stockCoverage').textContent = '股票评分已暂停 · 暂无完整快照';
      $('#sourceLabel').textContent = stockQuality.provider === 'sina'
        ? '新浪基础行情 · 暂停评分'
        : stockQuality.provider === 'eastmoney'
          ? '东方财富残缺行情 · 暂停评分'
          : '股票数据不可用 · 暂停评分';
    } else {
      $('#warningText').textContent = data.stale ? '正在展示最近成功快照' : warnings.length ? warnings.join('、') : '全部核心数据源正常';
      $('#stockCoverage').textContent = `${fullMarketText} · 聚焦 ${num(coverage.stockPool)} 只活跃样本`;
      $('#sourceLabel').textContent = data.stale ? '最后完整快照 · 东方财富' : '东方财富 · 完整评分';
    }
  }

  function renderAll(data) {
    const stockQuality = data.dataQuality && data.dataQuality.stocks;
    const scoringPaused = stockQuality && stockQuality.complete === false && !data.stockSnapshotAt;
    const pausedText = '股票榜数据源已降级，当前评分已暂停';
    renderStatus(data.status);
    renderHero(data);
    renderIndices(data.indices);
    renderHotspots(data.hotspots);
    renderSectors(data.sectors);
    renderHotStocks(data.stocks && data.stocks.hot, scoringPaused ? pausedText : '热门股票数据暂时不可用');
    renderTrendList('#intradayList', data.stocks && data.stocks.intraday, scoringPaused ? pausedText : '当前没有达到阈值的日内趋势候选');
    renderTrendList('#tomorrowList', data.stocks && data.stocks.tomorrow, scoringPaused ? pausedText : '当前没有达到阈值的明日观察候选');
    const next = data.pulse && data.pulse.nextTradingDay;
    $('#tomorrowTitle').textContent = next ? `${next.label}观察票 · ${next.short} ${next.weekday}` : '明日观察票';
    $('#trendMethod').textContent = data.methodology
      ? data.methodology.scoreDescription || `日内动能筛选分：${data.methodology.intraday}`
      : '日内动能筛选分：主要看当天涨幅、涨速、换手、量比、收盘位置、当日主力资金和流动性，用于在活跃股票池中排名。';
    $('#trendDisclaimer').textContent = data.methodology && data.methodology.disclaimer
      ? data.methodology.disclaimer
      : '仅作信息参考，不构成投资建议。';
    renderMeta(data);
  }

  async function loadOverview({ refresh = false, silent = false } = {}) {
    if (state.loading && refresh) return;
    const seq = ++state.requestSeq;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/market-overview${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '市场数据加载失败');
      if (seq !== state.requestSeq) return;
      state.data = payload;
      renderAll(payload);
      if (refresh) {
        const stockQuality = payload.dataQuality && payload.dataQuality.stocks;
        toast(stockQuality && stockQuality.complete === false
          ? payload.stockSnapshotAt ? '其他行情已更新，股票榜沿用完整快照' : '其他行情已更新，股票评分已暂停'
          : '市场全景已更新');
      }
    } catch (error) {
      if (seq !== state.requestSeq) return;
      toast(error.message || '市场数据加载失败', true);
      $('#marketSummary').textContent = '市场数据暂时无法连接，请稍后刷新。';
      $('#warningText').textContent = '数据源连接失败';
    } finally {
      if (seq === state.requestSeq && !silent) setLoading(false);
    }
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
        if (!items.length) {
          results.innerHTML = `<div class="search-empty">没有找到「${escapeHtml(query)}」对应的 A 股</div>`;
          return;
        }
        results.innerHTML = `
          <div class="search-results-head"><span>进入个股研究</span><span>${items.length} 只</span></div>
          ${items.map((item, index) => `
            <button class="search-result${index === 0 ? ' is-focused' : ''}" type="button" data-code="${escapeHtml(item.code)}">
              <span class="result-code">${escapeHtml(item.code)}</span>
              <span class="result-copy"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.industry || 'A 股')} · ${escapeHtml(item.pinyin || '')}</small></span>
              <span class="result-market">${escapeHtml(item.market || '')}</span>
            </button>`).join('')}`;
        state.searchFocus = 0;
      } catch {
        results.innerHTML = '<div class="search-empty">搜索服务暂不可用，可直接输入 6 位代码</div>';
      }
    };

    input.addEventListener('input', () => {
      const query = input.value.trim();
      clearTimeout(state.searchTimer);
      state.searchFocus = -1;
      if (!query) { results.hidden = true; return; }
      state.searchTimer = window.setTimeout(() => perform(query), 220);
    });
    input.addEventListener('keydown', (event) => {
      const buttons = $$('.search-result', results);
      if (event.key === 'ArrowDown' && buttons.length) {
        event.preventDefault();
        state.searchFocus = (state.searchFocus + 1) % buttons.length;
      } else if (event.key === 'ArrowUp' && buttons.length) {
        event.preventDefault();
        state.searchFocus = (state.searchFocus - 1 + buttons.length) % buttons.length;
      } else if (event.key === 'Enter') {
        const button = buttons[state.searchFocus] || buttons[0];
        if (button) { event.preventDefault(); select(button.dataset.code); }
        else select(input.value);
      } else if (event.key === 'Escape') {
        results.hidden = true;
      }
      buttons.forEach((button, index) => button.classList.toggle('is-focused', index === state.searchFocus));
    });
    results.addEventListener('click', (event) => {
      const button = event.target.closest('.search-result');
      if (button) select(button.dataset.code);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#searchShell')) results.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
      if (event.key === '/' && !typing) { event.preventDefault(); input.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.focus(); input.select(); }
    });
  }

  function bindNavigation() {
    const sectionLinks = $$('.market-nav a[href^="#"]');
    const sections = sectionLinks.map((link) => $(link.getAttribute('href'))).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      sectionLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-130px 0px -55% 0px', threshold: [0.05, 0.25] });
    sections.forEach((section) => observer.observe(section));
  }

  function buildRuleBody(rule) {
    if (!rule) return '<p class="rule-empty">计算规则暂不可用。</p>';
    const factors = Array.isArray(rule.factors) && rule.factors.length
      ? `<ul class="rule-factors">${rule.factors.map((f) =>
          `<li><span class="rule-factor-label">${escapeHtml(f.label)} <em>${escapeHtml(f.weight)}</em></span><span class="rule-factor-note">${escapeHtml(f.note)}</span></li>`
        ).join('')}</ul>`
      : '';
    return `
      <div class="rule-block"><h5>排名规则</h5><p>${escapeHtml(rule.rank)}</p></div>
      <div class="rule-block"><h5>日内动能分公式</h5><p class="rule-formula">${escapeHtml(rule.score)}</p>${factors}</div>
      <div class="rule-block"><h5>入围门槛</h5><p>${escapeHtml(rule.threshold)}</p></div>
      <div class="rule-block"><h5>置信度</h5><p>${escapeHtml(rule.confidence)}</p></div>`;
  }

  function closeRulePopover() {
    const pop = $('#rulePopover');
    if (!pop) return;
    pop.classList.remove('is-open');
    pop.setAttribute('aria-hidden', 'true');
  }

  function openRulePopover(button) {
    const rule = state.data && state.data.methodology && state.data.methodology[button.dataset.rule];
    const pop = $('#rulePopover');
    if (!pop) return;
    $('#rulePopoverTitle').textContent = rule && rule.title ? rule.title : '计算规则';
    $('#rulePopoverBody').innerHTML = buildRuleBody(rule);
    pop.classList.add('is-open');
    pop.setAttribute('aria-hidden', 'false');
    const width = Math.min(380, window.innerWidth - 24);
    const rect = button.getBoundingClientRect();
    pop.style.width = `${width}px`;
    const card = pop.querySelector('.rule-popover-card');
    const estHeight = Math.min(card.scrollHeight, 520) + 24;
    let top = rect.bottom + 10;
    if (top + estHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estHeight - 10);
    pop.style.top = `${Math.round(top)}px`;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    pop.style.left = `${Math.round(left)}px`;
  }

  function bindRulePopover() {
    $$('.trend-help').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const pop = $('#rulePopover');
        const isOpen = pop.classList.contains('is-open') && pop.getAttribute('data-for') === button.dataset.rule;
        if (isOpen) { closeRulePopover(); return; }
        pop.setAttribute('data-for', button.dataset.rule);
        openRulePopover(button);
      });
    });
    $('#rulePopoverClose').addEventListener('click', closeRulePopover);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.rule-popover') && !event.target.closest('.trend-help')) closeRulePopover();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeRulePopover();
    });
  }

  function boot() {
    updateClock();
    window.setInterval(updateClock, 1000);
    bindSearch();
    bindNavigation();
    bindRulePopover();
    $('#marketRefreshBtn').addEventListener('click', () => loadOverview({ refresh: true }));
    loadOverview();
    window.setInterval(() => {
      if (!document.hidden && state.data && state.data.status && state.data.status.state === 'open') loadOverview({ silent: true });
    }, 90_000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
