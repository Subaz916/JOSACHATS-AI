import {
  workspaceFor,
  countRows,
  requireUuid,
  splitList,
  parseExamples,
  publicAgent,
  getAgentForWorkspace
} from './shared.js';
import { assertAgentQuota } from '../services/quota.js';
import { ingestSource } from '../services/knowledge.js';
import { uploadFile, storagePath, removeFile } from '../services/storage.js';
import { notify, audit } from '../services/notifications.js';
import { qrDataUrl } from '../services/qr.js';
import { env } from '../config/env.js';
import { getServiceClient } from '../config/supabase.js';
import { HttpError } from '../utils/http-error.js';
import { uniqueSlug } from '../utils/id.js';

const agentColumns = {
  name: 'name',
  businessName: 'business_name',
  businessCategory: 'business_category',
  businessDescription: 'business_description',
  businessEmail: 'business_email',
  businessPhone: 'business_phone',
  businessAddress: 'business_address',
  websiteUrl: 'website_url',
  instructions: 'instructions',
  languages: 'languages',
  voice: 'voice',
  branding: 'branding',
  settings: 'settings'
};

const lengthMap = { short: 'short', medium: 'medium', detailed: 'long', long: 'long' };

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function responseLength(value) {
  return lengthMap[value] || 'medium';
}

function instructionRow(agentId, instructions = {}) {
  return {
    agent_id: agentId,
    personality: instructions.personality ?? null,
    style: instructions.style ?? null,
    response_length: responseLength(instructions.responseLength),
    rules: splitList(instructions.rules),
    policies: splitList(instructions.policies),
    topics_allow: splitList(instructions.topicsAllow),
    topics_avoid: splitList(instructions.topicsAvoid),
    escalation: instructions.escalation ?? null,
    examples: parseExamples(instructions.examples),
    custom_instructions: instructions.custom ?? null
  };
}

function publicUrlFor(agent) {
  return agent.public_url || `${String(env.publicAppUrl).replace(/\/+$/, '')}/chat/${agent.slug}`;
}

function logoPathFromUrl(logoUrl) {
  if (!logoUrl) return null;
  try {
    const path = new URL(logoUrl).pathname;
    const marker = '/object/public/agent-assets/';
    const index = path.indexOf(marker);
    return index === -1 ? null : decodeURIComponent(path.slice(index + marker.length));
  } catch {
    return null;
  }
}

function fileTypeFor(file) {
  const name = String(file?.originalname || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  return 'txt';
}

function knowledgeSourcesFor(body, agentName) {
  const knowledge = body.knowledge || {};
  const sources = [];

  if (knowledge.manualText) {
    sources.push({ type: 'manual', title: `${agentName} manual`, content: knowledge.manualText });
  }

  for (const faq of knowledge.faqs || []) {
    sources.push({
      type: 'faq',
      title: String(faq.question).slice(0, 200),
      content: `Question: ${faq.question}\nAnswer: ${faq.answer}`
    });
  }

  for (const url of knowledge.urls || []) {
    sources.push({ type: 'url', title: url, url });
  }

  for (const type of ['product', 'service', 'pricing', 'terms']) {
    const content = knowledge[`${type}Text`];
    if (content) sources.push({ type, title: `${agentName} ${type}`, content });
  }

  for (const file of body.knowledgeFiles || []) {
    if (!file?.buffer) continue;
    sources.push({
      type: fileTypeFor(file),
      title: file.originalname || 'Uploaded file',
      file
    });
  }

  return sources;
}

export async function listAgents(req, res, next) {
  try {
    const { workspace_id: workspaceId } = await workspaceFor(req.db, req.user.id);
    const total = await countRows(req.db, 'agents', [['workspace_id', workspaceId]]);
    if (!total) return res.json({ agents: [] });

    const { data, error } = await req.db.from('agents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Could not list agents');

    res.json({ agents: (data || []).map(publicAgent) });
  } catch (error) {
    next(error);
  }
}

export async function getAgent(req, res, next) {
  try {
    const { workspace_id: workspaceId } = await workspaceFor(req.db, req.user.id);
    const agentId = requireUuid(req.params.id, 'agent id');
    const agent = await getAgentForWorkspace(req.db, workspaceId, agentId);
    res.json({ agent: publicAgent(agent) });
  } catch (error) {
    next(error);
  }
}

export async function createAgent(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    await assertAgentQuota(db, workspaceId);

    const body = req.body || {};
    const slug = uniqueSlug(body.name);
    const publicUrl = `${String(env.publicAppUrl).replace(/\/+$/, '')}/chat/${slug}`;
    let logoUrl = null;

    if (body.logoFile?.buffer) {
      const path = storagePath(workspaceId, 'logos', body.logoFile.originalname);
      const uploaded = await uploadFile({
        bucket: 'agent-assets',
        path,
        buffer: body.logoFile.buffer,
        contentType: body.logoFile.mimetype
      });
      logoUrl = uploaded.publicUrl;
    }

    const row = {
      workspace_id: workspaceId,
      slug,
      name: body.name,
      business_name: body.businessName ?? null,
      business_category: body.businessCategory ?? null,
      business_description: body.businessDescription ?? null,
      business_email: body.businessEmail ?? null,
      business_phone: body.businessPhone || null,
      business_address: body.businessAddress || null,
      website_url: body.websiteUrl || null,
      logo_url: logoUrl,
      status: body.publish ? 'active' : 'draft',
      public_url: publicUrl,
      instructions: body.instructions || {},
      languages: body.languages || ['en'],
      voice: body.voice || {},
      branding: body.branding || {},
      settings: body.settings || {}
    };

    const { data: agent, error } = await db.from('agents').insert(row).select('*').single();
    if (error) throw new Error(error.message || 'Could not create agent');

    const { error: instructionsError } = await db.from('agent_instructions')
      .insert(instructionRow(agent.id, body.instructions));
    if (instructionsError) throw new Error(instructionsError.message || 'Could not save agent instructions');

    const warnings = [];
    for (const source of knowledgeSourcesFor(body, agent.name)) {
      try {
        await ingestSource(db, { workspaceId, agentId: agent.id, ...source });
      } catch (sourceError) {
        warnings.push({
          type: source.type,
          title: source.title,
          message: sourceError?.message || 'Could not ingest knowledge source'
        });
      }
    }

    const service = getServiceClient();
    await notify(service, {
      workspaceId,
      userId: req.user.id,
      type: 'agent.created',
      title: 'Agent created',
      body: `${agent.name} is ready to use.`,
      data: { agentId: agent.id, slug: agent.slug, status: agent.status }
    });
    await audit(service, {
      workspaceId,
      actorId: req.user.id,
      action: 'agent.create',
      entityType: 'agent',
      entityId: agent.id,
      metadata: { name: agent.name, status: agent.status },
      ip: req.ip
    });

    const qr = await qrDataUrl(publicUrl);
    res.status(201).json({ agent: publicAgent(agent), qrDataUrl: qr, warnings, publicUrl });
  } catch (error) {
    next(error);
  }
}

export async function updateAgent(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agentId = requireUuid(req.params.id, 'agent id');
    await getAgentForWorkspace(db, workspaceId, agentId);

    const body = req.body || {};
    const update = {};
    for (const [key, column] of Object.entries(agentColumns)) {
      if (has(body, key)) update[column] = body[key];
    }
    const hasInstructions = has(body, 'instructions');
    if (!Object.keys(update).length && !hasInstructions) throw new HttpError(400, 'No agent fields to update');

    if (hasInstructions) {
      const { error: instructionsError } = await db.from('agent_instructions')
        .upsert(instructionRow(agentId, body.instructions || {}), { onConflict: 'agent_id' });
      if (instructionsError) throw new Error(instructionsError.message || 'Could not update agent instructions');
    }

    let data;
    if (Object.keys(update).length) {
      const result = await db.from('agents')
        .update(update)
        .eq('id', agentId)
        .eq('workspace_id', workspaceId)
        .select('*')
        .single();
      if (result.error) throw new Error(result.error.message || 'Could not update agent');
      data = result.data;
    } else {
      data = await getAgentForWorkspace(db, workspaceId, agentId);
    }
    if (!data) throw new HttpError(404, 'Agent not found');

    res.json({ agent: publicAgent(data) });
  } catch (error) {
    next(error);
  }
}

export async function deleteAgent(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agentId = requireUuid(req.params.id, 'agent id');
    const agent = await getAgentForWorkspace(db, workspaceId, agentId);

    const { error } = await db.from('agents')
      .delete()
      .eq('id', agentId)
      .eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message || 'Could not delete agent');

    await removeFile({ bucket: 'agent-assets', path: logoPathFromUrl(agent.logo_url) });
    await audit(getServiceClient(), {
      workspaceId,
      actorId: req.user.id,
      action: 'agent.delete',
      entityType: 'agent',
      entityId: agentId,
      metadata: { name: agent.name },
      ip: req.ip
    });

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function publishAgent(req, res, next) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agentId = requireUuid(req.params.id, 'agent id');
    const agent = await getAgentForWorkspace(db, workspaceId, agentId);
    const status = req.body.status;

    if (status === 'active' && agent.status !== 'active') {
      await assertAgentQuota(db, workspaceId);
    }

    const { data, error } = await db.from('agents')
      .update({ status })
      .eq('id', agentId)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();
    if (error) throw new Error(error.message || 'Could not update agent status');

    await audit(getServiceClient(), {
      workspaceId,
      actorId: req.user.id,
      action: 'agent.status',
      entityType: 'agent',
      entityId: agentId,
      metadata: { from: agent.status, to: status },
      ip: req.ip
    });

    res.json({ agent: publicAgent(data) });
  } catch (error) {
    next(error);
  }
}

export async function shareAgent(req, res, next) {
  try {
    const { workspace_id: workspaceId } = await workspaceFor(req.db, req.user.id);
    const agentId = requireUuid(req.params.id, 'agent id');
    const agent = await getAgentForWorkspace(req.db, workspaceId, agentId);
    const publicUrl = publicUrlFor(agent);
    const qr = await qrDataUrl(publicUrl);
    res.json({ publicUrl, qrDataUrl: qr });
  } catch (error) {
    next(error);
  }
}
