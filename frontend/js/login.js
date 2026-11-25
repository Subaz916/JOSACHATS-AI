import { getConfig, loadConfig } from './config.js';
import { getSupabase } from './supabase.js';
import { qs, qsa, setLoading, toast } from './ui.js';

const DEFAULT_NEXT = '/dashboard.html';

function safeNext(value) {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return DEFAULT_NEXT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('auth-status--error', isError);
  element.hidden = false;
}

async function initLogin() {
  const status = qs('#loginStatus');
  const buttons = qsa('[data-oauth="google"]');
  const requestedNext = new URLSearchParams(window.location.search).get('next');

  try {
    await loadConfig();
    const config = getConfig();
    if (!config?.auth?.supabaseUrl || !config?.auth?.supabaseAnonKey) {
      throw new Error('Google sign-in is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY on the server.');
    }
    await getSupabase();
  } catch (error) {
    buttons.forEach((button) => {
      button.disabled = true;
    });
    setStatus(status, error.message || 'Authentication is not configured.', true);
    return;
  }

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const target = safeNext(requestedNext || button.dataset.next || DEFAULT_NEXT);
      setLoading(button, true, 'Redirecting…');
      setStatus(status, 'Opening Google sign-in…');

      try {
        const supabase = await getSupabase();
        const redirectTo = `${window.location.origin}/auth/callback.html?next=${encodeURIComponent(target)}`;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo }
        });
        if (error) throw error;
      } catch (error) {
        const message = error.message || 'Google sign-in could not start.';
        setLoading(button, false);
        setStatus(status, message, true);
        toast(message, 'error');
      }
    });
  });
}

initLogin();
