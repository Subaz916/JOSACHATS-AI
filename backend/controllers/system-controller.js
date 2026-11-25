import { getServiceClient } from '../config/supabase.js';
import { workspaceFor, requireUuid } from './shared.js';
import { env, publicConfig, capabilities } from '../config/env.js';
import { audit } from '../services/notifications.js';
import { HttpError, forbidden, notFound } from '../utils/http-error.js';

function serviceDb() {
  const db = getServiceClient();
  if (!db) throw new HttpError(503, 'Database service is not configured');
  return db;
}

function readError(error, fallback) {
  throw new Error(error?.message || fallback);
}

function isAdminRole(role) {
  return ['admin', 'super_admin'].includes(role);
}

async function adminRole(db, userId) {
  const { data, error } = await db.from('admin_roles').select('role').eq('user_id', userId).maybeSingle();
  if (error) readError(error, 'Could not check administrator role');
  return data?.role || null;
}

function systemEntries(body) {
  const entries = Array.isArray(body)
    ? body.map((item) => [String(item?.key || '').trim(), item?.value])
    : Object.entries(body || {}).map(([key, value]) => [String(key).trim(), value]);
  return entries.filter(([key, value]) => key && key.length <= 100 && value !== undefined);
}

export async function getSettings(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data: workspaceRow, error } = await db.from('workspaces')
    .select('id,name,slug,settings')
    .eq('id', workspace.workspace_id)
    .maybeSingle();
  if (error) readError(error, 'Could not read workspace settings');
  if (!workspaceRow) throw notFound('Workspace not found');

  const { data: profile, error: profileError } = await db.from('profiles')
    .select('id,full_name,avatar_url,email,status')
    .eq('id', req.user.id)
    .maybeSingle();
  if (profileError) readError(profileError, 'Could not read profile');

  const stored = workspaceRow.settings || {};
  const notificationPreferences = stored.notifications || stored.notificationPreferences || { email: true, inApp: true };
  res.json({
    workspace: { id: workspaceRow.id, name: workspaceRow.name, slug: workspaceRow.slug },
    profile: profile || { id: req.user.id, full_name: null, avatar_url: null, email: req.user.email || null, status: 'active' },
    settings: {
      ...stored,
      productName: stored.productName || env.productName,
      maintenanceMode: Boolean(stored.maintenanceMode),
      retentionDays: Number(stored.retentionDays || 30)
    },
    notificationPreferences
  });
}

export async function updateSettings(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const body = req.body || {};
  const profileFields = {};

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || '').trim();
    if (fullName.length < 2 || fullName.length > 120) throw new HttpError(400, 'Invalid fullName');
    profileFields.full_name = fullName;
  }
  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== 'string') throw new HttpError(400, 'Invalid avatarUrl');
    profileFields.avatar_url = body.avatarUrl ? String(body.avatarUrl).trim() : null;
  }

  const { data: workspaceRow, error } = await db.from('workspaces').select('settings').eq('id', workspace.workspace_id).maybeSingle();
  if (error) readError(error, 'Could not read workspace settings');
  if (!workspaceRow) throw notFound('Workspace not found');

  const settings = { ...(workspaceRow.settings || {}) };
  if (body.productName !== undefined) settings.productName = body.productName;
  if (body.maintenanceMode !== undefined) settings.maintenanceMode = body.maintenanceMode;
  if (body.retentionDays !== undefined) settings.retentionDays = body.retentionDays;
  const preferences = body.notificationPreferences ?? body.notifications;
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    settings.notifications = { ...(settings.notifications || {}), ...preferences };
  }

  const timestamp = new Date().toISOString();
  const { data: updatedWorkspace, error: workspaceError } = await db.from('workspaces')
    .update({ settings, updated_at: timestamp })
    .eq('id', workspace.workspace_id)
    .select('id,name,slug,settings')
    .single();
  if (workspaceError) readError(workspaceError, 'Could not update workspace settings');

  let updatedProfile = null;
  if (Object.keys(profileFields).length) {
    const { data, error: profileError } = await db.from('profiles')
      .update({ ...profileFields, updated_at: timestamp })
      .eq('id', req.user.id)
      .select('id,full_name,avatar_url,email,status')
      .single();
    if (profileError) readError(profileError, 'Could not update profile');
    updatedProfile = data;
  }

  const role = await adminRole(db, req.user.id);
  const systemRows = [];
  if (body.productName !== undefined) systemRows.push({ key: 'productName', value: body.productName });
  if (body.maintenanceMode !== undefined) systemRows.push({ key: 'maintenanceMode', value: body.maintenanceMode });
  if (body.retentionDays !== undefined) systemRows.push({ key: 'retentionDays', value: body.retentionDays });
  let systemSettingsUpdated = false;
  if (systemRows.length && isAdminRole(role)) {
    const { error: systemError } = await db.from('system_settings').upsert(
      systemRows.map((row) => ({ ...row, updated_by: req.user.id, updated_at: timestamp })),
      { onConflict: 'key' }
    );
    if (systemError) readError(systemError, 'Could not update system settings');
    systemSettingsUpdated = true;
  }

  await audit(db, {
    workspaceId: workspace.workspace_id,
    actorId: req.user.id,
    action: 'settings.updated',
    entityType: 'workspace',
    entityId: workspace.workspace_id,
    metadata: { keys: Object.keys(settings), systemSettingsUpdated },
    ip: req.ip || null
  }).catch(() => null);

  res.json({
    workspace: updatedWorkspace,
    profile: updatedProfile,
    settings,
    notificationPreferences: settings.notifications || { email: true, inApp: true },
    systemSettingsUpdated
  });
}

export async function getNotifications(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data, error } = await db.from('notifications')
    .select('id,type,title,body,data,is_read,user_id,created_at')
    .eq('workspace_id', workspace.workspace_id)
    .or(`user_id.is.null,user_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) readError(error, 'Could not list notifications');
  res.json({ notifications: data || [] });
}

export async function markNotificationRead(req, res) {
  const id = requireUuid(req.params.id, 'notification id');
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data, error } = await db.from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('workspace_id', workspace.workspace_id)
    .or(`user_id.is.null,user_id.eq.${req.user.id}`)
    .select('id,type,title,body,data,is_read,user_id,created_at')
    .maybeSingle();
  if (error) readError(error, 'Could not update notification');
  if (!data) throw notFound('Notification not found');
  res.json({ notification: data });
}

export async function getIntegrations(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data, error } = await db.from('integrations')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false });
  if (error) readError(error, 'Could not list integrations');
  res.json({ integrations: data || [] });
}

export async function createIntegration(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const body = req.body || {};
  const agentId = body.agentId ? requireUuid(body.agentId, 'agent id') : null;
  const type = String(body.type || '').trim().toLowerCase();
  if (!type) throw new HttpError(400, 'Integration type is required');
  if (body.config !== undefined && (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config))) {
    throw new HttpError(400, 'Invalid integration config');
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new HttpError(400, 'Invalid isActive value');

  if (agentId) {
    const { data: agent, error: agentError } = await db.from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('workspace_id', workspace.workspace_id)
      .maybeSingle();
    if (agentError) readError(agentError, 'Could not read agent');
    if (!agent) throw notFound('Agent not found');
  }

  let existingQuery = db.from('integrations').select('id').eq('workspace_id', workspace.workspace_id).eq('type', type);
  existingQuery = agentId ? existingQuery.eq('agent_id', agentId) : existingQuery.is('agent_id', null);
  const { data: existing, error: existingError } = await existingQuery.limit(1).maybeSingle();
  if (existingError) readError(existingError, 'Could not read integration');

  const values = {
    agent_id: agentId,
    type,
    config: body.config || {},
    is_active: body.isActive === undefined ? true : body.isActive,
    updated_at: new Date().toISOString()
  };

  let data;
  if (existing) {
    const { data: updated, error } = await db.from('integrations').update(values).eq('id', existing.id).select('*').single();
    if (error) readError(error, 'Could not update integration');
    data = updated;
  } else {
    const { data: inserted, error } = await db.from('integrations').insert({
      ...values,
      workspace_id: workspace.workspace_id
    }).select('*').single();
    if (error) readError(error, 'Could not create integration');
    data = inserted;
  }

  await audit(db, {
    workspaceId: workspace.workspace_id,
    actorId: req.user.id,
    action: existing ? 'integration.updated' : 'integration.created',
    entityType: 'integration',
    entityId: data.id,
    metadata: { type, agentId },
    ip: req.ip || null
  }).catch(() => null);

  res.json({ integration: data });
}

export async function getSystemSettings(req, res) {
  const db = serviceDb();
  const { data, error } = await db.from('system_settings')
    .select('key,value,updated_at')
    .order('key', { ascending: true });
  if (error) readError(error, 'Could not read system settings');
  const rows = data || [];
  res.json({
    settings: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    rows
  });
}

export async function updateSystemSettings(req, res) {
  const db = serviceDb();
  if (!isAdminRole(await adminRole(db, req.user.id))) throw forbidden('Administrator access required');
  const entries = systemEntries(req.body);
  if (!entries.length) throw new HttpError(400, 'No system settings provided');
  const timestamp = new Date().toISOString();
  const rows = entries.map(([key, value]) => ({ key, value, updated_by: req.user.id, updated_at: timestamp }));
  const { error } = await db.from('system_settings').upsert(rows, { onConflict: 'key' });
  if (error) readError(error, 'Could not update system settings');

  const { data, error: readErrorResult } = await db.from('system_settings').select('key,value,updated_at').order('key', { ascending: true });
  if (readErrorResult) readError(readErrorResult, 'Could not read system settings');
  const stored = data || [];

  await audit(db, {
    actorId: req.user.id,
    action: 'system_settings.updated',
    entityType: 'system_settings',
    entityId: null,
    metadata: { keys: entries.map(([key]) => key) },
    ip: req.ip || null
  }).catch(() => null);

  res.json({
    settings: Object.fromEntries(stored.map((row) => [row.key, row.value])),
    rows: stored
  });
}

export async function health(req, res) {
  res.json({
    ok: true,
    capabilities: {
      ...publicConfig().capabilities,
      supabase: capabilities.supabase
    }
  });
}
