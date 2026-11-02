(() => {
  'use strict';

  const form = document.querySelector('#loginForm');
  const account = document.querySelector('#account');
  const password = document.querySelector('#password');
  const remember = document.querySelector('#remember');
  const submit = document.querySelector('#submitButton');
  const error = document.querySelector('#formError');
  const toggle = document.querySelector('#passwordToggle');

  function destination() {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/market.html';
  }

  function setError(message) {
    error.textContent = message || '';
    form.classList.toggle('has-error', Boolean(message));
  }

  toggle.addEventListener('click', () => {
    const visible = password.type === 'text';
    password.type = visible ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!visible));
    toggle.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码');
    password.focus();
  });

  [account, password].forEach((input) => input.addEventListener('input', () => setError('')));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const accountValue = account.value.trim();
    if (!accountValue || !password.value) {
      setError('请输入账号和密码');
      (!accountValue ? account : password).focus();
      return;
    }

    setError('');
    submit.disabled = true;
    submit.classList.add('is-loading');
    form.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: accountValue, password: password.value, remember: remember.checked }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || '登录失败，请稍后重试');
      window.location.replace(destination());
    } catch (requestError) {
      setError(requestError.message === 'Failed to fetch' ? '无法连接服务器，请检查网络后重试' : requestError.message);
      password.select();
    } finally {
      submit.disabled = false;
      submit.classList.remove('is-loading');
      form.removeAttribute('aria-busy');
    }
  });
})();
