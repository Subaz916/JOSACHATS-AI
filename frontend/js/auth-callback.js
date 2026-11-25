import { loadConfig, getConfig } from './config.js';
import { getSupabase } from './supabase.js';

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

function showState(message, isError = false) {
  const state = document.getElementById('callbackState');
  if (!state) return;
  state.textContent = message;
  state.classList.toggle('auth-state--error', isError);
  state.hidden = false;
  if (isError) state.setAttribute('role', 'alert');
}

async function handleCallback() {
  const target = safeNext(new URLSearchParams(window.location.search).get('next'));

  try {
    await loadConfig();
    const config = getConfig();
    if (!config?.auth?.supabaseUrl || !config?.auth?.supabaseAnonKey) {
      throw new Error('Authentication is not configured on this server.');
    }
    showState('Completing sign-in…');
    const supabase = await getSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
    if (error) throw error;
    showState('Sign-in complete. Redirecting…');
    window.location.replace(target);
  } catch (error) {
    showState(error.message || 'Sign-in could not be completed.', true);
  }
}

handleCallback();
