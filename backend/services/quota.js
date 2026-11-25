import { getServiceClient } from '../config/supabase.js';
import { HttpError } from '../utils/http-error.js';

function monthRange(reference = new Date()) {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function getSubscriptionState(db, workspaceId) {
  const { data: subscriptions, error } = await db.from('subscriptions')
    .select('id,status,current_period_start,current_period_end,plan_id,subscription_plans(code,name,price_pkr,agent_limit,conversation_limit,features)')
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Could not read subscription');

  const now = new Date();
  const active = (subscriptions || []).find((item) => !item.current_period_end || new Date(item.current_period_end) > now);
  const plan = active?.subscription_plans || null;
  if (!active || !plan) {
    const service = getServiceClient();
    const { data: freePlan } = service
      ? await service.from('subscription_plans').select('id,code,name,price_pkr,agent_limit,conversation_limit,features').eq('code', 'free').maybeSingle()
      : { data: null };
    return {
      subscription: null,
      plan: freePlan || { code: 'free', name: 'Free', price_pkr: 0, agent_limit: 1, conversation_limit: 50, features: [] }
    };
  }
  return { subscription: active, plan };
}

export async function getMonthlyUsage(db, workspaceId) {
  const { start, end } = monthRange();
  const { data, error } = await db.from('usage_records')
    .select('kind,count')
    .eq('workspace_id', workspaceId)
    .gte('period_start', start.toISOString())
    .lt('period_start', end.toISOString());
  if (error) throw new Error(error.message || 'Could not read usage');
  const usage = { conversation: 0, voice: 0, text: 0 };
  for (const record of data || []) usage[record.kind] = (usage[record.kind] || 0) + Number(record.count || 0);
  return usage;
}

export async function quotaSummary(db, workspaceId) {
  const [{ subscription, plan }, usage] = await Promise.all([
    getSubscriptionState(db, workspaceId),
    getMonthlyUsage(db, workspaceId)
  ]);
  const limit = Number(plan.conversation_limit || 0);
  return { subscription, plan, usage, remaining: Math.max(0, limit - usage.conversation), limit };
}

export async function assertAgentQuota(db, workspaceId) {
  const { plan } = await getSubscriptionState(db, workspaceId);
  const { count, error } = await db.from('agents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
  if (error) throw new Error(error.message || 'Could not count agents');
  if ((count || 0) >= Number(plan.agent_limit || 0)) {
    throw new HttpError(403, `Plan limit reached. ${plan.name} allows ${plan.agent_limit} AI agent(s).`, { code: 'AGENT_LIMIT', plan: plan.code });
  }
  return plan;
}

export async function assertConversationQuota(db, workspaceId) {
  const state = await quotaSummary(db, workspaceId);
  if (state.usage.conversation + 1 > state.limit) {
    throw new HttpError(403, `Monthly conversation limit reached. Upgrade to continue.`, {
      code: 'CONVERSATION_LIMIT',
      usage: state.usage.conversation,
      limit: state.limit,
      plan: state.plan.code
    });
  }
  return state;
}

export async function recordUsage(db, { workspaceId, agentId, conversationId, channel }) {
  const { start, end } = monthRange();
  const rows = [
    { workspace_id: workspaceId, agent_id: agentId, conversation_id: conversationId, kind: 'conversation', count: 1, period_start: start.toISOString() },
    { workspace_id: workspaceId, agent_id: agentId, conversation_id: conversationId, kind: channel === 'voice' ? 'voice' : 'text', count: 1, period_start: start.toISOString() }
  ];
  const { error } = await db.from('usage_records').insert(rows);
  if (error) throw new Error(error.message || 'Could not record usage');
}

export async function currentPlanCode(db, workspaceId) {
  const { plan } = await getSubscriptionState(db, workspaceId);
  return plan.code;
}
