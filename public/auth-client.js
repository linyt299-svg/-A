(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if (response.status === 401) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    return response;
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const openDialog = (selector) => {
    const dialog = document.querySelector(selector);
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    else if (dialog) dialog.setAttribute('open', '');
  };
  const closeDialog = (dialog) => typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open');
  const showMessage = (form, message, error = false) => {
    const target = form.querySelector('.account-form-message');
    target.textContent = message || '';
    target.classList.toggle('is-error', error);
  };

  async function loadSubaccounts() {
    const list = document.querySelector('#subaccountList');
    if (!list) return;
    const response = await fetch('/api/admin/subaccounts');
    const payload = await response.json();
    list.innerHTML = (payload.items || []).length
      ? `<h3>已创建账号</h3>${payload.items.map((item) => `<div><b>${escapeHtml(item.displayName)}</b><span>${escapeHtml(item.phone)}</span><small>${item.ai.configured ? `AI ${escapeHtml(item.ai.maskedKey)}` : 'AI 未配置'}</small></div>`).join('')}`
      : '<p>尚未创建子账号</p>';
  }

  async function loadAlerts() {
    const list = document.querySelector('#accountAlertList');
    if (!list) return;
    list.innerHTML = '<p>正在读取提醒记录…</p>';
    const response = await fetch('/api/alerts');
    const payload = await response.json();
    const items = payload.items || [];
    list.innerHTML = items.length ? items.map((item) => `
      <article class="account-alert-item is-${escapeHtml(item.side)}">
        <div><b>${escapeHtml(item.title)}</b><time>${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))}</time></div>
        <p>${escapeHtml(item.stock.name)}（${escapeHtml(item.stock.code)}）· 触发价 ${escapeHtml(item.triggerPrice)} 元</p>
        <small>站内：已送达 · Webhook：${escapeHtml(item.channels?.webhook?.status === 'delivered' ? '已送达' : item.channels?.webhook?.status === 'failed' ? '重试失败' : '未配置')}</small>
      </article>`).join('') : '<p>暂无买入或卖出提醒</p>';
  }

  function renderAccountUi(user) {
    const topbar = document.querySelector('.topbar-right');
    if (!topbar) return;
    topbar.querySelector('.profile-chip')?.remove();
    const logout = topbar.querySelector('[data-logout]');
    const initials = user.displayName ? user.displayName.slice(0, 1) : user.phone.slice(-1);
    const role = user.role === 'super_admin' ? '超级管理员' : '子账号';
    const wrapper = document.createElement('div');
    wrapper.className = 'account-menu';
    wrapper.innerHTML = `
      <button class="profile-chip account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
        <span class="profile-avatar">${escapeHtml(initials)}</span>
        <span class="profile-copy"><b>${escapeHtml(user.displayName)}</b><small>${escapeHtml(role)}</small></span>
      </button>
      <div class="account-popover" role="menu">
        <div class="account-popover-head"><b>${escapeHtml(user.displayName)}</b><span>${escapeHtml(user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'))}</span></div>
        <button type="button" data-account-action="profile"><span>个人信息</span><small>手机号与账号权限</small></button>
        <button type="button" data-account-action="ai"><span>AI 设置</span><small>${user.ai.configured ? `已配置 ${escapeHtml(user.ai.maskedKey)}` : '配置个人 API Key'}</small></button>
      </div>`;
    topbar.insertBefore(wrapper, logout || null);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="account-dialog" id="profileDialog">
        <form method="dialog"><header><div><small>ACCOUNT PROFILE</small><h2>个人信息</h2></div><button value="cancel" aria-label="关闭">×</button></header></form>
        <dl class="profile-detail"><div><dt>手机号</dt><dd>${escapeHtml(user.phone)}</dd></div><div><dt>账号角色</dt><dd>${escapeHtml(role)}</dd></div><div><dt>权限范围</dt><dd>${user.role === 'super_admin' ? '可新增子账号；各账号仅管理自己的 AI 配置' : '仅可管理自己的资料、AI 配置和提醒'}</dd></div></dl>
        <div class="profile-admin-action"><button class="account-secondary" type="button" data-open-alerts>提醒记录</button>${user.role === 'super_admin' ? '<button class="account-primary" type="button" data-open-subaccounts>管理子账号</button>' : ''}</div>
      </dialog>
      <dialog class="account-dialog" id="aiSettingsDialog">
        <form id="aiSettingsForm"><header><div><small>PERSONAL AI</small><h2>AI 设置</h2></div><button type="button" data-dialog-close aria-label="关闭">×</button></header>
          <p class="account-dialog-note">API Key 由服务端加密保存，页面仅显示末四位。留空表示保留已保存的 Key。</p>
          <label><span>API Key</span><input name="apiKey" type="password" autocomplete="off" placeholder="${user.ai.configured ? escapeHtml(user.ai.maskedKey) : 'sk-...'}" /></label>
          <label><span>API 地址</span><input name="baseUrl" type="url" required value="${escapeHtml(user.ai.baseUrl)}" /></label>
          <label><span>模型</span><input name="model" required value="${escapeHtml(user.ai.model)}" /></label>
          <p class="account-form-message" role="status"></p><footer><button class="account-primary" type="submit">保存设置</button></footer>
        </form>
      </dialog>
      <dialog class="account-dialog" id="alertsDialog">
        <form method="dialog"><header><div><small>ALERT DELIVERY</small><h2>提醒记录</h2></div><button value="cancel" aria-label="关闭">×</button></header></form>
        <div class="account-alert-list" id="accountAlertList"><p>正在读取提醒记录…</p></div>
      </dialog>
      ${user.role === 'super_admin' ? `<dialog class="account-dialog" id="subaccountsDialog"><form id="subaccountForm"><header><div><small>ACCESS CONTROL</small><h2>新增子账号</h2></div><button type="button" data-dialog-close aria-label="关闭">×</button></header>
          <p class="account-dialog-note">子账号可独立登录、配置自己的 AI Key；不能查看或修改其他账号配置。</p>
          <label><span>姓名</span><input name="displayName" maxlength="30" required placeholder="例如：研究员 A" /></label><label><span>手机号</span><input name="phone" inputmode="numeric" pattern="1[0-9]{10}" maxlength="11" required /></label><label><span>初始密码</span><input name="password" type="password" minlength="8" required autocomplete="new-password" /></label>
          <p class="account-form-message" role="status"></p><footer><button class="account-primary" type="submit">创建子账号</button></footer><div class="subaccount-list" id="subaccountList"></div>
        </form></dialog>` : ''}`);

    const trigger = wrapper.querySelector('.account-menu-trigger');
    const setOpen = (open) => { wrapper.classList.toggle('is-open', open); trigger.setAttribute('aria-expanded', String(open)); };
    trigger.addEventListener('click', () => setOpen(!wrapper.classList.contains('is-open')));
    wrapper.addEventListener('mouseenter', () => setOpen(true));
    wrapper.addEventListener('mouseleave', () => setOpen(false));
    wrapper.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
      if (!action) return;
      setOpen(false);
      if (action === 'profile') openDialog('#profileDialog');
      if (action === 'ai') openDialog('#aiSettingsDialog');
    });
    document.addEventListener('click', (event) => { if (!wrapper.contains(event.target)) setOpen(false); });
    document.querySelectorAll('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
    document.querySelector('[data-open-subaccounts]')?.addEventListener('click', async () => {
      closeDialog(document.querySelector('#profileDialog'));
      openDialog('#subaccountsDialog');
      await loadSubaccounts();
    });
    document.querySelector('[data-open-alerts]')?.addEventListener('click', async () => {
      closeDialog(document.querySelector('#profileDialog'));
      openDialog('#alertsDialog');
      await loadAlerts();
    });

    document.querySelector('#aiSettingsForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      showMessage(form, '正在安全保存…');
      try {
        const response = await fetch('/api/profile/ai-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '保存失败');
        showMessage(form, `已保存，Key 仅显示为 ${payload.user.ai.maskedKey}`);
        form.elements.apiKey.value = '';
        wrapper.querySelector('[data-account-action="ai"] small').textContent = `已配置 ${payload.user.ai.maskedKey}`;
      } catch (error) { showMessage(form, error.message, true); }
      finally { submit.disabled = false; }
    });
    document.querySelector('#subaccountForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      showMessage(form, '正在创建…');
      try {
        const response = await fetch('/api/admin/subaccounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || '创建失败');
        showMessage(form, `子账号 ${payload.user.phone} 已创建`);
        form.reset();
        await loadSubaccounts();
      } catch (error) { showMessage(form, error.message, true); }
      finally { submit.disabled = false; }
    });
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-logout]');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try { await nativeFetch('/api/auth/logout', { method: 'POST' }); }
    finally { window.location.replace('/login'); }
  });

  async function boot() {
    try {
      const response = await fetch('/api/auth/session');
      const payload = await response.json();
      if (response.ok && payload.user) renderAccountUi(payload.user);
    } catch { /* Expired sessions are handled by the fetch wrapper. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
