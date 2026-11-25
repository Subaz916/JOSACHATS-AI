const loadingStates = new WeakMap();

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatOptions = Object.keys(options).length ? options : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat(undefined, formatOptions).format(date);
}

export function formatMoney(value, currency = 'PKR') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function toast(message, type = 'info', duration = 4200) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const allowed = ['info', 'success', 'warning', 'error'];
  const variant = allowed.includes(type) ? type : 'info';
  const item = document.createElement('div');
  item.className = `toast toast--${variant}`;

  const text = document.createElement('span');
  text.textContent = String(message || '');
  item.appendChild(text);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast__close';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => item.remove());
  item.appendChild(dismiss);

  container.appendChild(item);
  window.setTimeout(() => item.remove(), duration);
  return item;
}

export function setLoading(element, loading, loadingText = 'Loading…') {
  if (!element) return;

  if (loading) {
    if (!loadingStates.has(element)) {
      loadingStates.set(element, {
        html: element.innerHTML,
        disabled: element.disabled,
        ariaBusy: element.getAttribute('aria-busy')
      });
    }
    element.disabled = true;
    element.setAttribute('aria-busy', 'true');
    if (loadingText) element.textContent = loadingText;
    return;
  }

  const state = loadingStates.get(element);
  if (!state) return;
  element.innerHTML = state.html;
  element.disabled = state.disabled;
  if (state.ariaBusy === null) element.removeAttribute('aria-busy');
  else element.setAttribute('aria-busy', state.ariaBusy);
  loadingStates.delete(element);
}

export function statusBadge(status) {
  const value = String(status ?? 'unknown');
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  const label = value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `<span class="badge badge--${escapeHtml(slug)}">${escapeHtml(label)}</span>`;
}

export function emptyState(title, message = '', action = '') {
  const description = message ? `<p>${escapeHtml(message)}</p>` : '';
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${description}${action}</div>`;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function debounce(callback, delay = 300) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

export async function copyText(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    toast('Clipboard access was blocked.', 'warning');
  }

  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  if (!copied) toast('Could not copy text.', 'error');
  return copied;
}

export function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([String(text ?? '')], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
