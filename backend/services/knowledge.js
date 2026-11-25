import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import { chunkText, normalizeText } from '../utils/text.js';
import { fetchPublicText } from '../utils/safe-url.js';
import { storagePath, uploadFile } from './storage.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv']);
const DOCX_TYPES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const PDF_TYPES = new Set(['application/pdf']);

export async function extractText(file) {
  const name = String(file?.originalname || '').toLowerCase();
  const type = String(file?.mimetype || '').toLowerCase();
  if (!file?.buffer) throw new Error('No file provided');
  if (PDF_TYPES.has(type) || name.endsWith('.pdf')) {
    const result = await pdfParse(file.buffer);
    return normalizeText(result.text || '');
  }
  if (DOCX_TYPES.has(type) || name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeText(result.value || '');
  }
  if (TEXT_TYPES.has(type) || /\.(txt|md|csv)$/.test(name)) {
    return normalizeText(file.buffer.toString('utf8'));
  }
  throw new Error('Unsupported file type');
}

export async function prepareContent({ type, content, file, url }) {
  const metadata = {};
  let text = normalizeText(content);
  let filePath = null;

  if (file) {
    text = await extractText(file);
    filePath = storagePath('knowledge', type, file.originalname);
    const uploaded = await uploadFile({ bucket: 'knowledge-files', path: filePath, buffer: file.buffer, contentType: file.mimetype });
    metadata.file_url = uploaded.publicUrl;
  }

  if (type === 'url') {
    const result = await fetchPublicText(url);
    text = normalizeText(result.text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
    metadata.final_url = result.finalUrl;
  }

  if (!text) throw new Error('No text could be extracted from this source');
  return { text, filePath, metadata };
}

export async function ingestSource(db, { workspaceId, agentId, type, title, content, file, url }) {
  const prepared = await prepareContent({ type, content, file, url });
  const { data: source, error: sourceError } = await db.from('knowledge_sources').insert({
    workspace_id: workspaceId,
    agent_id: agentId || null,
    type,
    title,
    content: prepared.text,
    file_path: prepared.filePath,
    url: type === 'url' ? url : null,
    status: 'ready',
    metadata: prepared.metadata
  }).select('id,title,type,status,created_at').single();
  if (sourceError) throw new Error(sourceError.message || 'Could not save knowledge source');

  const chunks = chunkText(prepared.text).map((piece, index) => ({
    source_id: source.id,
    workspace_id: workspaceId,
    agent_id: agentId || null,
    content: piece,
    chunk_index: index,
    token_count: piece.length,
    metadata: { title, type }
  }));

  if (chunks.length) {
    const { error: chunkError } = await db.from('knowledge_chunks').insert(chunks);
    if (chunkError) throw new Error(chunkError.message || 'Could not index knowledge');
  }

  return { ...source, chunkCount: chunks.length };
}

export async function retrieveKnowledge(db, { workspaceId, agentId, query, limit = 6 }) {
  let builder = db.from('knowledge_chunks')
    .select('id,content,metadata,source_id,chunk_index')
    .eq('workspace_id', workspaceId)
    .limit(250);
  if (agentId) builder = builder.or(`agent_id.is.null,agent_id.eq.${agentId}`);
  else builder = builder.is('agent_id', null);
  const { data, error } = await builder;
  if (error) throw new Error(error.message || 'Knowledge retrieval failed');

  const queryTokens = new Set((String(query || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
  const lowered = String(query || '').toLowerCase().trim();
  const ranked = (data || []).map((chunk) => {
    const text = String(chunk.content || '').toLowerCase();
    const tokens = text.match(/[\p{L}\p{N}]+/gu) || [];
    let score = 0;
    for (const token of queryTokens) {
      if (tokens.includes(token)) score += 1;
    }
    if (lowered.length > 4 && text.includes(lowered)) score += 4;
    return { ...chunk, score };
  }).filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  return ranked;
}

export async function formatKnowledgeContext(db, { workspaceId, agentId, query }) {
  const chunks = await retrieveKnowledge(db, { workspaceId, agentId, query });
  if (!chunks.length) return { text: '', chunks: [] };
  return {
    chunks,
    text: chunks.map((chunk, index) => `[${index + 1}] ${chunk.metadata?.title || 'Knowledge'}: ${chunk.content}`).join('\n\n')
  };
}
