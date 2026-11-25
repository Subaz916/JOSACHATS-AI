import { HttpError } from '../utils/http-error.js';
import { isValidUuid } from '../middleware/auth.js';

export async function workspaceFor(db, userId) {
  const { data: membership, error: memberError } = await db.from('workspace_members')
    .select('workspace_id,role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message || 'Could not read workspace membership');
  if (membership?.workspace_id) return membership;

  const { data: owned, error: ownedError } = await db.from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownedError) throw new Error(ownedError.message || 'Could not read workspace');
  if (owned?.id) return { workspace_id: owned.id, role: 'owner' };
  throw new HttpError(403, 'No workspace found for this account');
}

export async function countRows(db, table, filters = []) {
  let query = db.from(table).select('id', { count: 'exact', head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(error.message || `Could not count ${table}`);
  return count || 0;
}

export function requireUuid(value, label = 'id') {
  if (!isValidUuid(value)) throw new HttpError(400, `Invalid ${label}`);
  return value;
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

export function parseExamples(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  }
}

export function publicAgent(agent) {
  if (!agent) return null;
  const branding = agent.branding || {};
  const voice = agent.voice || {};
  const settings = agent.settings || {};
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    agentName: branding.displayName || agent.name,
    businessName: agent.business_name,
    businessCategory: agent.business_category,
    businessDescription: agent.business_description,
    businessEmail: agent.business_email,
    businessPhone: agent.business_phone,
    businessAddress: agent.business_address,
    websiteUrl: agent.website_url,
    logoUrl: agent.logo_url,
    welcomeMessage: branding.welcomeMessage || `Assalam-o-Alaikum! I am ${branding.displayName || agent.name}. How can I help you today?`,
    branding: {
      primaryColor: branding.primaryColor || '#6d5efc',
      secondaryColor: branding.secondaryColor || '#18b6a4',
      chatBackground: branding.chatBackground || null,
      agentAvatarUrl: branding.agentAvatarUrl || null,
      theme: branding.theme || 'light'
    },
    languages: Array.isArray(agent.languages) ? agent.languages : ['en'],
    voice: {
      provider: voice.provider || 'browser',
      style: voice.style || null,
      speed: Number(voice.speed || 1),
      responseMode: voice.responseMode || 'balanced',
      voiceName: voice.voiceName || null,
      defaultLanguage: voice.defaultLanguage || (agent.languages || ['en'])[0] || 'en'
    },
    settings: {
      voiceInput: settings.voiceInput !== false,
      voiceOutput: settings.voiceOutput !== false,
      textInput: settings.textInput !== false,
      textResponses: settings.textResponses !== false,
      maxResponseLength: Number(settings.maxResponseLength || 1200),
      humanSupport: settings.humanSupport === true,
      openingHours: settings.openingHours || null,
      feedback: settings.feedback !== false
    },
    status: agent.status,
    publicUrl: agent.public_url
  };
}

export async function getAgentForWorkspace(db, workspaceId, agentId) {
  requireUuid(agentId, 'agent id');
  const { data, error } = await db.from('agents').select('*').eq('id', agentId).eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw new Error(error.message || 'Could not read agent');
  if (!data) throw new HttpError(404, 'Agent not found');
  return data;
}

export function monthStart(reference = new Date()) {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1)).toISOString();
}
