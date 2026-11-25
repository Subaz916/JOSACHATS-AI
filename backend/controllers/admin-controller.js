import { getServiceClient } from '../config/supabase.js';
import { countRows, requireUuid, monthStart } from './shared.js';
import { audit } from '../services/notifications.js';
import { HttpError, notFound } from '../utils/http-error.js';

function serviceDb() {
  const db = getServiceClient();
  if (!db) throw new HttpError(503, 'Database service is not configured');
  return db;
}

function readError(error, fallback) {
  throw new Error(error?.message || fallback);
}

function rows(result, fallback) {
  if (result.error) readError(result.error, fallback);
  return result.data || [];
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function searchTerm(value) {
  return String(value || '').replace(/[%,()\\]/g, ' ').trim().slice(0, 120);
}

function mapPlanFields(body, partial = false) {
  const fields = {};
  const assign = (key, target) => {
    if (!partial || body[key] !== undefined) fields[target] = body[key];
  };
  assign('code', 'code');
  assign('name', 'name');
  assign('pricePkr', 'price_pkr');
  assign('agentLimit', 'agent_limit');
  assign('conversationLimit', 'conversation_limit');
  assign('features', 'features');
  assign('isActive', 'is_active');
  assign('sortOrder', 'sort_order');
  return fields;
}

export async function getOverview(req, res) {
  const db = serviceDb();
  const start = monthStart();
  const [users, activeUsers, agents, activeAgents, conversations, activeSubscriptions, totalTransactions, failedPayments, revenueResult] = await Promise.all([
    countRows(db, 'profiles'),
    countRows(db, 'profiles', [['status', 'active']]),
    countRows(db, 'agents'),
    countRows(db, 'agents', [['status', 'active']]),
    countRows(db, 'conversations'),
    countRows(db, 'subscriptions', [['status', 'active']]),
    countRows(db, 'payments'),
    countRows(db, 'payments', [['status', 'failed']]),
    db.from('payments').select('amount_pkr').eq('status', 'succeeded').gte('paid_at', start)
  ]);
  const monthlyRevenue = rows(revenueResult, 'Could not calculate revenue')
    .reduce((total, payment) => total + (Number(payment.amount_pkr) || 0), 0);

  res.json({
    users,
    activeUsers,
    agents,
    activeAgents,
    conversations,
    activeSubscriptions,
    monthlyRevenue,
    totalTransactions,
    failedPayments
  });
}

export async function getUsers(req, res) {
  const db = serviceDb();
  const search = searchTerm(req.query.search);
  let query = db.from('profiles')
    .select('id,full_name,email,status,is_admin,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  const profiles = rows(await query, 'Could not list users');
  const userIds = unique(profiles.map((profile) => profile.id));
  const workspaceByUser = new Map();
  const workspaceIds = [];

  if (userIds.length) {
    const memberships = rows(await db.from('workspace_members').select('user_id,workspace_id').in('user_id', userIds), 'Could not list memberships');
    const owned = rows(await db.from('workspaces').select('id,owner_id').in('owner_id', userIds), 'Could not list workspaces');
    for (const membership of memberships) {
      if (!workspaceByUser.has(membership.user_id)) workspaceByUser.set(membership.user_id, new Set());
      workspaceByUser.get(membership.user_id).add(membership.workspace_id);
      workspaceIds.push(membership.workspace_id);
    }
    for (const workspace of owned) {
      if (!workspaceByUser.has(workspace.owner_id)) workspaceByUser.set(workspace.owner_id, new Set());
      workspaceByUser.get(workspace.owner_id).add(workspace.id);
      workspaceIds.push(workspace.id);
    }
  }

  let agents = [];
  let subscriptions = [];
  const uniqueWorkspaceIds = unique(workspaceIds);
  if (uniqueWorkspaceIds.length) {
    agents = rows(await db.from('agents').select('id,workspace_id').in('workspace_id', uniqueWorkspaceIds), 'Could not list agents');
    subscriptions = rows(
      await db.from('subscriptions').select('id,workspace_id,status,subscription_plans(code,name)').in('workspace_id', uniqueWorkspaceIds),
      'Could not list subscriptions'
    );
  }

  const users = profiles.map((profile) => {
    const ids = [...(workspaceByUser.get(profile.id) || [])];
    const profileAgents = agents.filter((agent) => ids.includes(agent.workspace_id));
    const profileSubscriptions = subscriptions.filter((subscription) => ids.includes(subscription.workspace_id));
    const active = profileSubscriptions.find((subscription) => ['active', 'trialing'].includes(subscription.status));
    return {
      ...profile,
      workspaceCount: ids.length,
      agentCount: profileAgents.length,
      subscriptionCount: profileSubscriptions.length,
      plan: active?.subscription_plans || null
    };
  });

  res.json({ users });
}

export async function updateUserStatus(req, res) {
  const id = requireUuid(req.params.id, 'user id');
  const db = serviceDb();
  const { data, error } = await db.from('profiles')
    .update({ status: req.body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,full_name,email,status,is_admin,updated_at')
    .single();
  if (error) readError(error, 'Could not update user');
  if (!data) throw notFound('User not found');

  await audit(db, {
    actorId: req.user.id,
    action: req.body.status === 'active' ? 'user.activated' : 'user.suspended',
    entityType: 'profile',
    entityId: id,
    metadata: { status: req.body.status },
    ip: req.ip || null
  }).catch(() => null);

  res.json({ user: data });
}

export async function getPlans(req, res) {
  const db = serviceDb();
  const { data, error } = await db.from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) readError(error, 'Could not list plans');
  res.json({ plans: data || [] });
}

export async function createPlan(req, res) {
  const db = serviceDb();
  const fields = mapPlanFields(req.body);
  const { data, error } = await db.from('subscription_plans').insert({
    ...fields,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select('*').single();
  if (error) readError(error, 'Could not create plan');

  await audit(db, {
    actorId: req.user.id,
    action: 'plan.created',
    entityType: 'subscription_plan',
    entityId: data.id,
    metadata: { code: data.code },
    ip: req.ip || null
  }).catch(() => null);

  res.status(201).json({ plan: data });
}

export async function updatePlan(req, res) {
  const id = requireUuid(req.params.id, 'plan id');
  const db = serviceDb();
  const fields = mapPlanFields(req.body, true);
  if (!Object.keys(fields).length) throw new HttpError(400, 'No plan fields provided');

  const { data, error } = await db.from('subscription_plans')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) readError(error, 'Could not update plan');
  if (!data) throw notFound('Plan not found');

  await audit(db, {
    actorId: req.user.id,
    action: 'plan.updated',
    entityType: 'subscription_plan',
    entityId: id,
    metadata: fields,
    ip: req.ip || null
  }).catch(() => null);

  res.json({ plan: data });
}

export async function deletePlan(req, res) {
  const id = requireUuid(req.params.id, 'plan id');
  const db = serviceDb();
  const { data, error } = await db.from('subscription_plans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) readError(error, 'Could not deactivate plan');
  if (!data) throw notFound('Plan not found');

  await audit(db, {
    actorId: req.user.id,
    action: 'plan.deactivated',
    entityType: 'subscription_plan',
    entityId: id,
    metadata: { code: data.code },
    ip: req.ip || null
  }).catch(() => null);

  res.json({ plan: data });
}

export async function getAgents(req, res) {
  const db = serviceDb();
  const search = searchTerm(req.query.search);
  let query = db.from('agents')
    .select('id,workspace_id,slug,name,business_name,status,public_url,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (search) query = query.or(`name.ilike.%${search}%,business_name.ilike.%${search}%`);

  const agents = rows(await query, 'Could not list agents');
  const workspaceIds = unique(agents.map((agent) => agent.workspace_id));
  const agentIds = unique(agents.map((agent) => agent.id));
  let workspaces = [];
  let conversations = [];
  let usage = [];

  if (workspaceIds.length) {
    workspaces = rows(await db.from('workspaces').select('id,name,slug,owner_id').in('id', workspaceIds), 'Could not list workspaces');
  }
  const ownerIds = unique(workspaces.map((workspace) => workspace.owner_id));
  let owners = [];
  if (ownerIds.length) {
    owners = rows(await db.from('profiles').select('id,full_name,email').in('id', ownerIds), 'Could not list owners');
  }
  if (agentIds.length) {
    conversations = rows(await db.from('conversations').select('agent_id,status').in('agent_id', agentIds), 'Could not list conversations');
    usage = rows(await db.from('usage_records').select('agent_id,kind,count').in('agent_id', agentIds), 'Could not list usage');
  }

  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

  const result = agents.map((agent) => {
    const workspace = workspaceMap.get(agent.workspace_id) || null;
    const agentConversations = conversations.filter((conversation) => conversation.agent_id === agent.id);
    const usageCounts = { conversation: 0, voice: 0, text: 0 };
    for (const record of usage) {
      if (record.agent_id === agent.id) usageCounts[record.kind] = (usageCounts[record.kind] || 0) + Number(record.count || 0);
    }
    return {
      ...agent,
      workspace,
      owner: workspace ? ownerMap.get(workspace.owner_id) || null : null,
      conversationCount: agentConversations.length,
      activeConversations: agentConversations.filter((conversation) => conversation.status === 'open' || conversation.status === 'pending').length,
      usage: usageCounts
    };
  });

  res.json({ agents: result });
}

export async function updateAgentStatus(req, res) {
  const id = requireUuid(req.params.id, 'agent id');
  const status = String(req.body?.status || '').trim();
  if (!['active', 'inactive'].includes(status)) throw new HttpError(400, 'Invalid agent status');
  const db = serviceDb();
  const { data, error } = await db.from('agents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,name,workspace_id,status,updated_at')
    .single();
  if (error) readError(error, 'Could not update agent');
  if (!data) throw notFound('Agent not found');

  await audit(db, {
    workspaceId: data.workspace_id,
    actorId: req.user.id,
    action: status === 'active' ? 'agent.activated' : 'agent.deactivated',
    entityType: 'agent',
    entityId: id,
    metadata: { status },
    ip: req.ip || null
  }).catch(() => null);

  res.json({ agent: data });
}

export async function getLogs(req, res) {
  const db = serviceDb();
  const { data, error } = await db.from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) readError(error, 'Could not list audit logs');
  res.json({ logs: data || [] });
}

export async function getPayments(req, res) {
  const db = serviceDb();
  const { data, error } = await db.from('payments')
    .select('*, subscription_plans(code,name), workspaces(id,name,slug)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) readError(error, 'Could not list payments');
  res.json({ payments: data || [] });
}
