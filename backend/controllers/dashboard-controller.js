import { workspaceFor, countRows, monthStart } from './shared.js';
import { quotaSummary } from '../services/quota.js';
import { HttpError } from '../utils/http-error.js';

function userDb(req) {
  if (!req.db) throw new HttpError(503, 'Supabase client is not configured');
  return req.db;
}

function checkError(error, message) {
  if (error) throw new Error(error.message || message);
}

function snippet(value, length = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

async function recentConversations(db, workspaceId, limit = 10) {
  const columns = 'id,agent_id,status,language,channel,customer_identifier,created_at,updated_at';
  let result = await db.from('conversations')
    .select(`${columns},agents(name,slug)`)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) {
    result = await db.from('conversations')
      .select(columns)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
  }
  checkError(result.error, 'Could not read recent conversations');

  const rows = result.data || [];
  const messages = await Promise.all(rows.map((row) => db.from('messages')
    .select('content,created_at')
    .eq('conversation_id', row.id)
    .order('created_at', { ascending: false })
    .limit(1)));
  for (const messageQuery of messages) checkError(messageQuery.error, 'Could not read recent messages');

  return rows.map((row, index) => ({
    ...row,
    agentName: row.agents?.name || null,
    agentSlug: row.agents?.slug || null,
    lastMessage: snippet(messages[index].data?.[0]?.content || ''),
    lastMessageAt: messages[index].data?.[0]?.created_at || null
  }));
}

async function agentPerformance(db, workspaceId) {
  const [agents, conversations] = await Promise.all([
    db.from('agents').select('id,name,slug,status').eq('workspace_id', workspaceId).order('name', { ascending: true }),
    db.from('conversations').select('id,agent_id,status').eq('workspace_id', workspaceId)
  ]);
  checkError(agents.error, 'Could not read agents');
  checkError(conversations.error, 'Could not read conversations');

  const performance = new Map((agents.data || []).map((agent) => [agent.id, {
    agentId: agent.id,
    agentName: agent.name,
    agentSlug: agent.slug,
    status: agent.status,
    total: 0,
    open: 0,
    pending: 0,
    resolved: 0,
    archived: 0
  }]));

  for (const conversation of conversations.data || []) {
    const entry = performance.get(conversation.agent_id);
    if (!entry) continue;
    entry.total += 1;
    if (entry[conversation.status] !== undefined) entry[conversation.status] += 1;
  }

  return [...performance.values()].sort((a, b) => b.total - a.total);
}

export async function overview(req, res, next) {
  try {
    const db = userDb(req);
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const start = monthStart();
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [agentsTotal, agentsActive, conversationsTotal, monthlyConversations, usage, summary] = await Promise.all([
      countRows(db, 'agents', [['workspace_id', workspaceId]]),
      countRows(db, 'agents', [['workspace_id', workspaceId], ['status', 'active']]),
      countRows(db, 'conversations', [['workspace_id', workspaceId]]),
      (async () => {
        const { count, error } = await db.from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .gte('created_at', startIso);
        checkError(error, 'Could not count monthly conversations');
        return count || 0;
      })(),
      db.from('usage_records')
        .select('kind,count')
        .eq('workspace_id', workspaceId)
        .gte('period_start', startIso)
        .lt('period_start', endIso),
      quotaSummary(db, workspaceId)
    ]);
    checkError(usage.error, 'Could not read usage records');

    const interactions = { voice: 0, text: 0 };
    for (const row of usage.data || []) {
      if (row.kind === 'voice' || row.kind === 'text') {
        interactions[row.kind] += Number(row.count || 0);
      }
    }

    const recent = await recentConversations(db, workspaceId, 8);
    const performance = await agentPerformance(db, workspaceId);

    return res.json({
      agents: { total: agentsTotal, active: agentsActive },
      conversations: { total: conversationsTotal, monthly: monthlyConversations },
      interactions,
      quota: { remaining: summary.remaining, limit: summary.limit, usage: summary.usage },
      totalAgents: agentsTotal,
      activeAgents: agentsActive,
      totalConversations: conversationsTotal,
      monthlyConversations,
      voiceInteractions: interactions.voice,
      textInteractions: interactions.text,
      remainingQuota: summary.remaining,
      subscription: summary.subscription,
      plan: summary.plan,
      recentConversations: recent,
      agentPerformance: performance
    });
  } catch (error) {
    return next(error);
  }
}

export async function recent(req, res, next) {
  try {
    const db = userDb(req);
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const rows = await recentConversations(db, workspaceId, 20);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}
