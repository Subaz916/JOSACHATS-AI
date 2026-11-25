import { getAnonClient, getServiceClient, getUserClient } from '../config/supabase.js';
import { capabilities } from '../config/env.js';
import { unauthorized, unavailable, forbidden } from '../utils/http-error.js';

export async function requireAuth(req, res, next) {
  try {
    if (!capabilities.supabase) throw unavailable('Authentication service is not configured');
    const header = String(req.headers.authorization || '');
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) throw unauthorized();
    const token = match[1].trim();
    const anon = getAnonClient();
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Session is invalid or expired');
    req.user = data.user;
    req.token = token;
    req.db = getUserClient(token);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const db = getServiceClient();
    if (!db) throw unavailable('Admin service is not configured');
    const { data, error } = await db.from('admin_roles').select('role').eq('user_id', req.user.id).maybeSingle();
    if (error) throw error;
    if (!data || !['admin', 'super_admin'].includes(data.role)) throw forbidden('Administrator access required');
    req.adminRole = data.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
