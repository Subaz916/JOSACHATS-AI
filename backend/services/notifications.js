export async function notify(db, { workspaceId, userId = null, type, title, body, data = {} }) {
  if (!db) return null;
  const { data: row, error } = await db.from('notifications').insert({
    workspace_id: workspaceId,
    user_id: userId,
    type,
    title,
    body,
    data
  }).select('id,type,title,body,is_read,created_at').single();
  if (error) throw new Error(error.message || 'Could not create notification');
  return row;
}

export async function audit(db, { workspaceId = null, actorId = null, action, entityType, entityId = null, metadata = {}, ip = null }) {
  if (!db) return null;
  const { error } = await db.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    ip
  });
  if (error) throw new Error(error.message || 'Could not write audit log');
  return true;
}
