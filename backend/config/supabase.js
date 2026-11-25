import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

let serviceClient;
let anonClient;

export function getServiceClient() {
  if (!env.supabaseUrl || !env.supabaseServiceKey) return null;
  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return serviceClient;
}

export function getAnonClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (!anonClient) {
    anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return anonClient;
}

export function getUserClient(token) {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !token) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function dataError(error, fallback) {
  if (error) {
    const err = new Error(error.message || fallback || 'Database request failed');
    err.status = 502;
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return fallback;
}
