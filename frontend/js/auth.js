import { getSupabase, qs, toast } from './core.js';

function safeNext() {
  const value = new URLSearchParams(location.search).get('next') || '/dashboard.html';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard.html';
}

async function initLogin() {
  const button = qs('#google-signin');
  const errorBox = qs('#auth-error');
  if (!button) return;
  button.addEventListener('click', async () => {
    try {
      const supabase = await getSupabase();
      button.disabled = true;
      button.textContent = 'Connecting to Google...';
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback.html?next=${encodeURIComponent(safeNext())}` } });
      if (error) throw error;
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Continue with Google';
      if (errorBox) errorBox.textContent = error.message;
      toast(error.message, 'error');
    }
  });
}

async function initCallback() {
  const status = qs('#callback-status');
  if (!status || !location.search.includes('code=')) return;
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
    if (error) throw error;
    status.textContent = 'Sign-in successful. Redirecting...';
    location.replace(safeNext());
  } catch (error) {
    status.textContent = `Sign-in failed: ${error.message}`;
  }
}

initLogin();
initCallback();
