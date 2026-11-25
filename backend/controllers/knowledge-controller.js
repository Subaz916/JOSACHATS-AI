import { workspaceFor, countRows, requireUuid, getAgentForWorkspace } from './shared.js';
import { ingestSource } from '../services/knowledge.js';
import { removeFile } from '../services/storage.js';
import { HttpError } from '../utils/http-error.js';
import { knowledgeSchema } from '../validators/schemas.js';

async function agentIdFor(db, workspaceId, value) {
  if (!value) return null;
  await getAgentForWorkspace(db, workspaceId, value);
  return value;
}

export async function listKnowledge(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agentId = await agentIdFor(db, workspaceId, req.query.agentId || null);
    const filters = [['workspace_id', workspaceId]];
    if (agentId) filters.push(['agent_id', agentId]);

    const total = await countRows(db, 'knowledge_sources', filters);
    if (!total) return res.json({ sources: [] });

    let query = db.from('knowledge_sources')
      .select('*')
      .eq('workspace_id', workspaceId);
    if (agentId) query = query.eq('agent_id', agentId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Could not list knowledge sources');

    res.json({ sources: data || [] });
  } catch (error) {
    next(error);
  }
}

export async function createKnowledge(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const parsed = knowledgeSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid knowledge source', parsed.error.flatten());
    }

    const body = parsed.data;
    const agentId = await agentIdFor(db, workspaceId, req.body?.agentId || null);
    const source = await ingestSource(db, {
      workspaceId,
      agentId,
      type: body.type,
      title: body.title,
      content: body.content ?? null,
      url: body.url ?? null,
      file: req.file || null
    });

    res.status(201).json({ source });
  } catch (error) {
    next(error);
  }
}

export async function deleteKnowledge(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const sourceId = requireUuid(req.params.id, 'knowledge id');

    const { data: source, error } = await db.from('knowledge_sources')
      .select('id,file_path')
      .eq('id', sourceId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Could not read knowledge source');
    if (!source) throw new HttpError(404, 'Knowledge source not found');

    const { error: deleteError } = await db.from('knowledge_sources')
      .delete()
      .eq('id', sourceId)
      .eq('workspace_id', workspaceId);
    if (deleteError) throw new Error(deleteError.message || 'Could not delete knowledge source');

    await removeFile({ bucket: 'knowledge-files', path: source.file_path });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}
