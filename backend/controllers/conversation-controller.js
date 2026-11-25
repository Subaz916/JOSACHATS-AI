import { workspaceFor, requireUuid } from './shared.js';
import { HttpError, badRequest, notFound } from '../utils/http-error.js';
import { notify, audit } from '../services/notifications.js';

const conversationColumns = 'id,agent_id,status,language,channel,customer_identifier,assigned_to,created_at,updated_at';
const conversationWithAgent = `${conversationColumns},agents(name,slug)`;
const messageColumns = 'id,conversation_id,role,content,language,audio_path,metadata,created_at';
const supportColumns = 'id,conversation_id,status,assigned_to,reason,notes,created_at,updated_at';
const supportWithConversation = `${supportColumns},conversations(id,status,language,channel,customer_identifier,created_at,agents(name,slug))`;

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

function applyConversationFilters(query, req) {
  const filters = req.query || {};
  let next = query;
  if (filters.status) next = next.eq('status', String(filters.status));
  if (filters.agentId) {
    requireUuid(filters.agentId, 'agent id');
    next = next.eq('agent_id', filters.agentId);
  }
  if (filters.language) next = next.eq('language', String(filters.language));
  if (filters.from) next = next.gte('created_at', parseDate(filters.from, 'from'));
  if (filters.to) next = next.lte('created_at', parseDate(filters.to, 'to'));
  if (filters.search) {
    requireUuid(filters.search, 'conversation id');
    next = next.eq('id', filters.search);
  }
  return next;
}

async function findConversation(db, workspaceId, id) {
  let result = await db.from('conversations')
    .select(conversationWithAgent)
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (result.error) {
    result = await db.from('conversations')
      .select(conversationColumns)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();
  }
  checkError(result.error, 'Could not read conversation');
  if (!result.data) throw notFound('Conversation not found');
  return result.data;
}

async function loadMessages(db, conversationId) {
  const { data, error } = await db.from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  checkError(error, 'Could not read messages');
  return data || [];
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function listConversations(req, res, next) {
  try {
    const db = userDb(req);
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    let result = await applyConversationFilters(
      db.from('conversations').select(conversationWithAgent).eq('workspace_id', workspaceId),
      req
    ).order('created_at', { ascending: false }).limit(200);
    if (result.error) {
      result = await applyConversationFilters(
        db.from('conversations').select(conversationColumns).eq('workspace_id', workspaceId),
        req
      ).order('created_at', { ascending: false }).limit(200);
    }
    checkError(result.error, 'Could not list conversations');
    return res.json(result.data || []);
  } catch (error) {
    return next(error);
  }
}

export async function getConversationDetail(req, res, next) {
  try {
    const db = userDb(req);
    const id = requireUuid(req.params.id, 'conversation id');
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const conversation = await findConversation(db, workspaceId, id);
    const [messages, feedback, requests] = await Promise.all([
      loadMessages(db, id),
      db.from('feedback').select('id,rating,comment,created_at').eq('conversation_id', id).order('created_at', { ascending: true }),
      db.from('human_support_requests').select(supportColumns).eq('conversation_id', id).order('created_at', { ascending: false })
    ]);
    checkError(feedback.error, 'Could not read feedback');
    checkError(requests.error, 'Could not read human support requests');
    return res.json({
      conversation,
      messages,
      feedback: feedback.data || [],
      handoffRequests: requests.data || []
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateConversation(req, res, next) {
  try {
    const db = userDb(req);
    const id = requireUuid(req.params.id, 'conversation id');
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const patch = {};
    const body = req.body || {};
    if (body.status !== undefined) {
      if (!['open', 'pending', 'resolved', 'archived'].includes(body.status)) throw badRequest('Invalid conversation status');
      patch.status = body.status;
    }
    const assignedTo = body.assigned_to ?? body.assignedTo;
    if (assignedTo !== undefined) {
      patch.assigned_to = assignedTo === null ? null : requireUuid(assignedTo, 'assigned user id');
    }
    if (!Object.keys(patch).length) throw badRequest('No conversation updates supplied');

    const { data, error } = await db.from('conversations')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    checkError(error, 'Could not update conversation');
    if (!data) throw notFound('Conversation not found');

    await audit(db, {
      workspaceId,
      actorId: req.user.id,
      action: 'conversation.updated',
      entityType: 'conversation',
      entityId: id,
      metadata: patch
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

export async function exportConversation(req, res, next) {
  try {
    const db = userDb(req);
    const id = requireUuid(req.params.id, 'conversation id');
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const conversation = await findConversation(db, workspaceId, id);
    const messages = await loadMessages(db, id);
    const format = String(req.query.format || 'json').toLowerCase();

    if (format === 'csv') {
      const rows = [['created_at', 'role', 'language', 'content', 'audio_path']];
      for (const message of messages) {
        rows.push([message.created_at, message.role, message.language, message.content, message.audio_path]);
      }
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${id}.csv"`);
      return res.type('text/csv').send(csv);
    }

    if (format !== 'json') throw badRequest('Invalid export format');
    res.setHeader('Content-Disposition', `attachment; filename="conversation-${id}.json"`);
    return res.type('application/json').send(JSON.stringify({ conversation, messages }, null, 2));
  } catch (error) {
    return next(error);
  }
}

export async function listHumanSupport(req, res, next) {
  try {
    const db = userDb(req);
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    let query = db.from('human_support_requests')
      .select(supportWithConversation)
      .eq('workspace_id', workspaceId);
    if (req.query.status) query = query.eq('status', String(req.query.status));
    let result = await query.order('created_at', { ascending: false }).limit(200);
    if (result.error) {
      let fallback = db.from('human_support_requests').select(supportColumns).eq('workspace_id', workspaceId);
      if (req.query.status) fallback = fallback.eq('status', String(req.query.status));
      result = await fallback.order('created_at', { ascending: false }).limit(200);
    }
    checkError(result.error, 'Could not list human support requests');
    return res.json(result.data || []);
  } catch (error) {
    return next(error);
  }
}

export async function updateHumanSupport(req, res, next) {
  try {
    const db = userDb(req);
    const id = requireUuid(req.params.id, 'human support request id');
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const body = req.body || {};
    const patch = {};
    if (body.status !== undefined) {
      if (!['open', 'assigned', 'resolved', 'returned'].includes(body.status)) throw badRequest('Invalid human support status');
      patch.status = body.status;
    }
    const assignedTo = body.assigned_to ?? body.assignedTo;
    if (assignedTo !== undefined) {
      patch.assigned_to = assignedTo === null ? null : requireUuid(assignedTo, 'assigned user id');
    }
    if (body.notes !== undefined) patch.notes = body.notes === null ? null : String(body.notes).slice(0, 5000);
    if (!Object.keys(patch).length) throw badRequest('No human support updates supplied');

    const { data: existing, error: existingError } = await db.from('human_support_requests')
      .select('id,conversation_id')
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();
    checkError(existingError, 'Could not read human support request');
    if (!existing) throw notFound('Human support request not found');

    const { data, error } = await db.from('human_support_requests')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select('*')
      .single();
    checkError(error, 'Could not update human support request');

    const { data: workspace, error: workspaceError } = await db.from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .maybeSingle();
    checkError(workspaceError, 'Could not read workspace');

    await notify(db, {
      workspaceId,
      userId: workspace?.owner_id || null,
      type: 'human_support_updated',
      title: 'Human support request updated',
      body: `Status changed to ${patch.status || 'updated'}.`,
      data: { conversationId: existing.conversation_id, requestId: id }
    });
    await audit(db, {
      workspaceId,
      actorId: req.user.id,
      action: 'human_support.updated',
      entityType: 'human_support_request',
      entityId: id,
      metadata: patch
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
}
