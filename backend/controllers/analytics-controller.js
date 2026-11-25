import { workspaceFor, monthStart } from './shared.js';
import { HttpError, badRequest } from '../utils/http-error.js';

function userDb(req) {
  if (!req.db) throw new HttpError(503, 'Supabase client is not configured');
  return req.db;
}

function checkError(error, message) {
  if (error) throw new Error(error.message || message);
}

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`Invalid ${label} date`);
  return date.toISOString();
}

async function fetchByConversationIds(db, table, columns, workspaceId, ids, extra = () => {}) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 200) {
    let query = db.from(table)
      .select(columns)
      .eq('workspace_id', workspaceId)
      .in('conversation_id', ids.slice(index, index + 200));
    query = extra(query);
    const { data, error } = await query.order('created_at', { ascending: true });
    checkError(error, `Could not read ${table}`);
    rows.push(...(data || []));
  }
  return rows;
}

export async function analytics(req, res, next) {
  try {
    const db = userDb(req);
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const from = parseDate(req.query.from, 'from') || monthStart();
    const to = parseDate(req.query.to, 'to') || new Date().toISOString();
    if (new Date(from) > new Date(to)) throw badRequest('from date must be before to date');

    let result = await db.from('conversations')
      .select('id,agent_id,language,channel,created_at,agents(name,slug)')
      .eq('workspace_id', workspaceId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true });
    if (result.error) {
      result = await db.from('conversations')
        .select('id,agent_id,language,channel,created_at')
        .eq('workspace_id', workspaceId)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: true });
    }
    checkError(result.error, 'Could not read conversations');
    const conversations = result.data || [];
    const conversationIds = conversations.map((conversation) => conversation.id);

    const dailyConversations = {};
    const languageDistribution = {};
    const channelDistribution = {};
    const agentMap = new Map();
    for (const conversation of conversations) {
      const day = String(conversation.created_at || '').slice(0, 10);
      if (day) dailyConversations[day] = (dailyConversations[day] || 0) + 1;
      const language = conversation.language || 'unknown';
      const channel = conversation.channel || 'unknown';
      languageDistribution[language] = (languageDistribution[language] || 0) + 1;
      channelDistribution[channel] = (channelDistribution[channel] || 0) + 1;
      const key = conversation.agent_id || 'unknown';
      const entry = agentMap.get(key) || {
        agentId: conversation.agent_id || null,
        agentName: conversation.agents?.name || 'Unknown agent',
        agentSlug: conversation.agents?.slug || null,
        count: 0
      };
      entry.count += 1;
      agentMap.set(key, entry);
    }

    if (!conversationIds.length) {
      return res.json({
        range: { from, to },
        totalConversations: 0,
        dailyConversations,
        languageDistribution,
        channelDistribution,
        topQuestions: [],
        unansweredQuestions: [],
        satisfaction: { average: null, count: 0 },
        agentUsage: []
      });
    }

    const messages = await fetchByConversationIds(
      db,
      'messages',
      'id,conversation_id,role,content,created_at',
      workspaceId,
      conversationIds,
      (query) => query.in('role', ['user', 'assistant'])
    );
    const feedbackRows = await fetchByConversationIds(
      db,
      'feedback',
      'id,conversation_id,rating,created_at',
      workspaceId,
      conversationIds
    );

    const questionMap = new Map();
    const byConversation = new Map();
    for (const message of messages) {
      const list = byConversation.get(message.conversation_id) || [];
      list.push(message);
      byConversation.set(message.conversation_id, list);
      if (message.role !== 'user') continue;
      const question = String(message.content || '').trim().toLowerCase();
      if (!question) continue;
      const entry = questionMap.get(question) || { question, count: 0, lastSeen: null };
      entry.count += 1;
      if (!entry.lastSeen || new Date(message.created_at) > new Date(entry.lastSeen)) {
        entry.lastSeen = message.created_at;
      }
      questionMap.set(question, entry);
    }

    const unansweredQuestions = [];
    for (const [conversationId, list] of byConversation) {
      for (let index = 0; index < list.length; index += 1) {
        const message = list[index];
        if (message.role !== 'user') continue;
        const answered = list.slice(index + 1).some((item) => item.role === 'assistant');
        if (!answered) {
          unansweredQuestions.push({
            id: message.id,
            conversationId,
            question: String(message.content || '').trim(),
            createdAt: message.created_at
          });
        }
      }
    }

    const ratingSum = feedbackRows.reduce((sum, row) => sum + Number(row.rating || 0), 0);
    const satisfaction = {
      average: feedbackRows.length ? Math.round((ratingSum / feedbackRows.length) * 100) / 100 : null,
      count: feedbackRows.length
    };

    const topQuestions = [...questionMap.values()]
      .sort((a, b) => b.count - a.count || String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
      .slice(0, 10);
    const agentUsage = [...agentMap.values()].sort((a, b) => b.count - a.count);

    return res.json({
      range: { from, to },
      totalConversations: conversations.length,
      dailyConversations,
      languageDistribution,
      channelDistribution,
      topQuestions,
      unansweredQuestions,
      satisfaction,
      agentUsage
    });
  } catch (error) {
    return next(error);
  }
}
