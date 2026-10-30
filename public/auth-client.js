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

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-logout]');
    if (!button || button.disabled) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await nativeFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/login');
    }
  });
})();
