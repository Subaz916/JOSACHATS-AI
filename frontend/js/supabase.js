import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadConfig } from './config.js';

let client = null;
let clientKey = '';

function currentPath() {
  return `${window.location.pathname}${window.location.search}` || '/';
}

export async function getSupabase() {
  const config = await loadConfig();
  const auth = config?.auth || {};
  const url = String(auth.supabaseUrl || '').trim();
  const key = String(auth.supabaseAnonKey || '').trim();

  if (!url || !key) {
    throw new Error('Supabase authentication is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to the server environment.');
  }

  const nextKey = `${url}|${key}`;
  if (!client || clientKey !== nextKey) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    clientKey = nextKey;
  }

  return client;
}

export async function requireSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = data?.session || null;
  if (!session?.access_token) {
    const next = encodeURIComponent(currentPath());
    window.location.assign(`/login.html?next=${next}`);
    return null;
  }

  return session;
}

export async function currentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

export async function authHeaders() {
  const session = await requireSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function logout() {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch {
    window.location.assign('/login.html');
    return;
  }
  window.location.assign('/login.html');
}
