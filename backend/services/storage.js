import { getServiceClient } from '../config/supabase.js';
import { HttpError } from '../utils/http-error.js';

export async function uploadFile({ bucket, path, buffer, contentType, upsert = true }) {
  const db = getServiceClient();
  if (!db) throw new HttpError(503, 'Storage service is not configured');
  const { error } = await db.storage.from(bucket).upload(path, buffer, { contentType, upsert });
  if (error) throw new HttpError(502, error.message || 'File upload failed');
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data?.publicUrl || '' };
}

export async function removeFile({ bucket, path }) {
  const db = getServiceClient();
  if (!db || !path) return;
  await db.storage.from(bucket).remove([path]);
}

export function storagePath(workspaceId, scope, filename) {
  const clean = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return `${workspaceId}/${scope}/${Date.now()}-${clean}`;
}
