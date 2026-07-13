'use strict';

document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');

document.getElementById('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

const form         = document.getElementById('loginForm');
const errorBanner  = document.getElementById('errorBanner');
const loginBtn     = document.getElementById('loginBtn');
const btnText      = loginBtn.querySelector('.btn-text');
const btnSpinner   = loginBtn.querySelector('.btn-spinner');

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  btnText.hidden = loading;
  btnSpinner.hidden = !loading;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorBanner.hidden = true;
  setLoading(true);

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || 'Sign in failed.');
      setLoading(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('next') || '/';
  } catch {
    showError('Network error — please try again.');
    setLoading(false);
  }
});
