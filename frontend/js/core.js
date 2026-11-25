let cachedConfig = null;
let supabaseClient = null;

export async function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load application configuration');
  cachedConfig = await response.json();
  return cachedConfig;
}

export function getConfig() {
  return cachedConfig;
}

export async function getSupabase() {
  const config = await loadConfig();
  if (!config.auth?.supabaseUrl || !config.auth?.supabaseAnonKey) {
    throw new Error('Supabase is not configured on the server');
  }
  if (!supabaseClient) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabaseClient = createClient(config.auth.supabaseUrl, config.auth.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return supabaseClient;
}

function safeNext(value) {
  const path = String(value || '/dashboard.html');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard.html';
}

export async function currentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export async function requireSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    const next = safeNext(new URLSearchParams(location.search).get('next') || location.pathname + location.search);
    location.replace(`/login.html?next=${encodeURIComponent(next)}`);
    return null;
  }
  return data.session;
}

export async function authHeaders() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function logout() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  location.replace('/login.html');
}

export async function api(path, options = {}) {
  const { method = 'GET', body, auth = true, headers = {}, raw = false } = options;
  const url = /^https?:\/\//i.test(path) ? path : path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  const requestHeaders = { ...headers };
  if (auth) Object.assign(requestHeaders, await authHeaders());
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(url, { method, headers: requestHeaders, body: payload, credentials: 'same-origin' });
  if (raw) {
    if (!response.ok) throw Object.assign(new Error(`Request failed (${response.status})`), { status: response.status });
    return response;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data?.error?.details || data?.details;
    error.code = data?.error?.details?.code;
    throw error;
  }
  return data;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function formatMoney(value) {
  const number = Number(value || 0);
  return `PKR ${number.toLocaleString('en-US')}`;
}

export function statusBadge(status) {
  const value = String(status || 'unknown');
  const className = ['active', 'ready', 'succeeded', 'open', 'resolved'].includes(value) ? 'ok' : ['pending', 'assigned', 'trialing'].includes(value) ? 'warn' : 'muted';
  return `<span class="badge ${className}">${escapeHtml(value)}</span>`;
}

export function emptyState(title, message = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div>`;
}

export function toast(message, type = 'info') {
  let container = qs('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  container.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

export function setLoading(node, loading, label = 'Loading...') {
  if (!node) return;
  if (loading) {
    node.dataset.originalText = node.textContent;
    node.disabled = true;
    node.textContent = label;
  } else {
    node.disabled = false;
    node.textContent = node.dataset.originalText || node.textContent;
  }
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export async function copyText(value) {
  await navigator.clipboard.writeText(String(value || ''));
  toast('Copied to clipboard', 'success');
}

export function downloadText(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function applyTheme(theme) {
  const chosen = theme || localStorage.getItem('josachats-theme') || 'auto';
  const dark = chosen === 'dark' || (chosen === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('josachats-theme', chosen);
  return chosen;
}

export function themeToggleButton() {
  const current = applyTheme();
  return `<button class="icon-btn theme-toggle" type="button" aria-label="Toggle theme" data-theme="${current}">${current === 'dark' ? '☀' : '☾'}</button>`;
}

export function wireThemeToggle(root = document) {
  qsa('.theme-toggle', root).forEach((button) => {
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      applyTheme(current === 'dark' ? 'light' : 'dark');
      button.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
    });
  });
}
