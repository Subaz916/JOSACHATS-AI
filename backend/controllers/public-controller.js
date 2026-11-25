import { getServiceClient } from '../config/supabase.js';
import { publicAgent } from './shared.js';
import { assertConversationQuota, recordUsage } from '../services/quota.js';
import { formatKnowledgeContext } from '../services/knowledge.js';
import { generateReply, resolveLanguage, voiceForLanguage } from '../services/ai.js';
import { detectLanguage } from '../utils/text.js';
import { notify, audit } from '../services/notifications.js';
import { synthesizeSpeech } from '../integrations/speech/service.js';
import { uploadFile, storagePath } from '../services/storage.js';
import { HttpError, badRequest, notFound } from '../utils/http-error.js';
import { makeToken } from '../utils/id.js';

const messageColumns = 'id,conversation_id,role,content,language,audio_path,metadata,created_at';

function serviceDb() {
  const db = getServiceClient();
  if (!db) throw new HttpError(503, 'Supabase service client is not configured');
  return db;
}

function checkError(error, message) {
  if (error) throw new Error(error.message || message);
}

function validateToken(token) {
  const value = String(token || '').trim();
  if (value.length < 12 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw badRequest('Invalid conversation token');
  }
  return value;
}

async function loadPublicConversation(db, token) {
  const publicToken = validateToken(token);
  const { data: conversation, error: conversationError } = await db.from('conversations')
    .select('id,workspace_id,agent_id,language,channel,status')
    .eq('public_token', publicToken)
    .maybeSingle();
  checkError(conversationError, 'Could not read conversation');
  if (!conversation) throw notFound('Conversation not found');

  const { data: agent, error: agentError } = await db.from('agents')
    .select('*')
    .eq('id', conversation.agent_id)
    .eq('status', 'active')
    .maybeSingle();
  checkError(agentError, 'Could not read agent');
  if (!agent) throw notFound('Conversation not found');

  return { conversation, agent };
}

async function loadMessages(db, conversationId) {
  const { data, error } = await db.from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  checkError(error, 'Could not read messages');
  return data || [];
}

async function loadHistory(db, conversationId) {
  const { data, error } = await db.from('messages')
    .select(messageColumns)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20);
  checkError(error, 'Could not read message history');
  return (data || []).reverse();
}

async function loadInstructions(db, agent) {
  const { data, error } = await db.from('agent_instructions')
    .select('personality,style,response_length,rules,policies,topics_allow,topics_avoid,escalation,examples,custom_instructions')
    .eq('agent_id', agent.id)
    .maybeSingle();
  checkError(error, 'Could not read agent instructions');
  const stored = agent.instructions || {};
  return {
    ...stored,
    personality: data?.personality ?? stored.personality ?? null,
    style: data?.style ?? stored.style ?? null,
    responseLength: data?.response_length || stored.responseLength || 'medium',
    rules: data?.rules?.length ? data.rules : stored.rules || [],
    policies: data?.policies?.length ? data.policies : stored.policies || [],
    topicsAllow: data?.topics_allow?.length ? data.topics_allow : stored.topicsAllow || [],
    topicsAvoid: data?.topics_avoid?.length ? data.topics_avoid : stored.topicsAvoid || [],
    escalation: data?.escalation ?? stored.escalation ?? null,
    examples: data?.examples?.length ? data.examples : stored.examples || [],
    custom: data?.custom_instructions ?? stored.custom ?? null
  };
}

async function loadCatalog(db, agent) {
  let productsQuery = db.from('products')
    .select('id,name,description,price_pkr,category,variations,image_url')
    .eq('workspace_id', agent.workspace_id)
    .eq('available', true)
    .or(`agent_id.is.null,agent_id.eq.${agent.id}`)
    .limit(100);
  let servicesQuery = db.from('services')
    .select('id,name,description,price_pkr,category,image_url')
    .eq('workspace_id', agent.workspace_id)
    .eq('available', true)
    .or(`agent_id.is.null,agent_id.eq.${agent.id}`)
    .limit(100);

  const [products, services] = await Promise.all([productsQuery, servicesQuery]);
  checkError(products.error, 'Could not read products');
  checkError(services.error, 'Could not read services');
  return { products: products.data || [], services: services.data || [] };
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  return ` - PKR ${Number(value).toLocaleString('en-US')}`;
}

function buildBusinessFacts(agent, products, services) {
  const lines = [
    `Business name: ${agent.business_name || 'Not provided'}`,
    `Business category: ${agent.business_category || 'Not provided'}`,
    `Business description: ${agent.business_description || 'Not provided'}`,
    `Phone: ${agent.business_phone || 'Not provided'}`,
    `Address: ${agent.business_address || 'Not provided'}`,
    `Email: ${agent.business_email || 'Not provided'}`,
    `Website: ${agent.website_url || 'Not provided'}`,
    `Opening hours: ${agent.settings?.openingHours || 'Not provided'}`
  ];

  lines.push(products.length ? 'Available products:' : 'Available products: None listed.');
  for (const product of products) {
    lines.push(`- ${product.name}${formatPrice(product.price_pkr)}${product.category ? ` (${product.category})` : ''}: ${product.description || 'No description'}${product.variations ? ` Variations: ${product.variations}` : ''}`);
  }

  lines.push(services.length ? 'Available services:' : 'Available services: None listed.');
  for (const service of services) {
    lines.push(`- ${service.name}${formatPrice(service.price_pkr)}${service.category ? ` (${service.category})` : ''}: ${service.description || 'No description'}`);
  }

  return lines.join('\n');
}

function supportReply(language) {
  if (language === 'ur') {
    return 'آپ کی درخواست ہماری انسانی معاونت ٹیم کے پاس ہے۔ وہ جلد از جلد جواب دیں گے، اس میں کچھ وقت لگ سکتا ہے۔';
  }
  if (language === 'hi' || language === 'hinglish') {
    return 'Aapki request human support team ke paas hai. Ve jald se jald reply karenge; isme kuch time lag sakta hai.';
  }
  return 'Your request is with our human support team. They will reply as soon as possible, but this may take some time.';
}

function extensionFor(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('aac')) return 'm4a';
  return 'mp3';
}

async function storeAudio(db, { conversation, messageId, audio, language }) {
  const path = storagePath(conversation.workspace_id, 'audio', `${conversation.id}-${messageId}.${extensionFor(audio.contentType)}`);
  const uploaded = await uploadFile({
    bucket: 'audio',
    path,
    buffer: audio.buffer,
    contentType: audio.contentType || 'audio/mpeg'
  });
  const { error: assetError } = await db.from('audio_assets').insert({
    workspace_id: conversation.workspace_id,
    conversation_id: conversation.id,
    message_id: messageId,
    storage_path: path,
    mime_type: audio.contentType || 'audio/mpeg'
  });
  checkError(assetError, 'Could not save audio asset');
  const { data, error } = await db.from('messages')
    .update({ audio_path: path })
    .eq('id', messageId)
    .select(messageColumns)
    .single();
  checkError(error, 'Could not update message audio');
  return { message: data, audioPath: path, audioUrl: uploaded.publicUrl || null, language };
}

export async function createConversation(req, res, next) {
  try {
    const db = serviceDb();
    const slug = String(req.params.slug || '').trim();
    if (!slug) throw badRequest('Invalid agent slug');

    const { data: agent, error } = await db.from('agents')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();
    checkError(error, 'Could not read agent');
    if (!agent) throw notFound('Agent not found');

    await assertConversationQuota(db, agent.workspace_id);

    const body = req.body || {};
    const language = resolveLanguage(
      body.language ?? agent.voice?.defaultLanguage ?? (agent.languages || ['en'])[0] ?? 'en',
      agent.languages
    );
    const channel = body.channel || 'text';
    if (!['voice', 'text'].includes(channel)) throw badRequest('Invalid channel');
    const identifier = body.customerIdentifier ?? body.customer_identifier ?? null;
    const customerIdentifier = typeof identifier === 'string' && identifier.trim() ? identifier.trim().slice(0, 200) : null;

    const { data: conversation, error: conversationError } = await db.from('conversations').insert({
      workspace_id: agent.workspace_id,
      agent_id: agent.id,
      public_token: makeToken(24),
      customer_identifier: customerIdentifier,
      language,
      channel
    }).select('id,public_token,language,channel').single();
    checkError(conversationError, 'Could not create conversation');

    const agentView = publicAgent(agent);
    const { data: systemMessage, error: messageError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      workspace_id: agent.workspace_id,
      role: 'system',
      content: agentView.welcomeMessage,
      language,
      metadata: {}
    }).select(messageColumns).single();
    checkError(messageError, 'Could not create welcome message');

    await recordUsage(db, {
      workspaceId: agent.workspace_id,
      agentId: agent.id,
      conversationId: conversation.id,
      channel
    });

    return res.status(201).json({
      token: conversation.public_token,
      agent: agentView,
      messages: [systemMessage]
    });
  } catch (error) {
    return next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const db = serviceDb();
    const { conversation, agent } = await loadPublicConversation(db, req.params.token);
    const messages = await loadMessages(db, conversation.id);
    return res.json({ agent: publicAgent(agent), messages });
  } catch (error) {
    return next(error);
  }
}

export async function postMessage(req, res, next) {
  try {
    const db = serviceDb();
    const { conversation, agent } = await loadPublicConversation(db, req.params.token);
    const body = req.body || {};
    const history = await loadHistory(db, conversation.id);
    const detected = detectLanguage(body.content);
    const language = resolveLanguage(body.language || detected, agent.languages);
    const requestedChannel = req.interactionChannel || req.query.channel || req.headers['x-channel'] || conversation.channel;
    const channel = String(requestedChannel || conversation.channel);
    if (!['voice', 'text'].includes(channel)) throw badRequest('Invalid channel');

    const { data: supportRequest, error: supportError } = await db.from('human_support_requests')
      .select('id')
      .eq('conversation_id', conversation.id)
      .in('status', ['open', 'assigned'])
      .limit(1)
      .maybeSingle();
    checkError(supportError, 'Could not read human support requests');

    const { data: userMessage, error: userError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      role: 'user',
      content: body.content,
      language,
      metadata: body.clientMessageId ? { clientMessageId: body.clientMessageId } : {}
    }).select(messageColumns).single();
    checkError(userError, 'Could not save message');

    let reply;
    if (supportRequest) {
      reply = supportReply(language);
    } else {
      const [instructions, knowledge, catalog] = await Promise.all([
        loadInstructions(db, agent),
        formatKnowledgeContext(db, { workspaceId: conversation.workspace_id, agentId: agent.id, query: body.content }),
        loadCatalog(db, agent)
      ]);
      reply = await generateReply({
        agent,
        instructions,
        businessFacts: buildBusinessFacts(agent, catalog.products, catalog.services),
        knowledgeText: knowledge.text,
        history,
        content: body.content,
        language
      });
    }

    const { data: assistantMessage, error: assistantError } = await db.from('messages').insert({
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      role: 'assistant',
      content: reply,
      language,
      metadata: supportRequest ? { humanSupport: true } : {}
    }).select(messageColumns).single();
    checkError(assistantError, 'Could not save reply');

    let finalMessage = assistantMessage;
    let audioPath = null;
    let audioUrl = null;
    const audio = await synthesizeSpeech({
      text: reply,
      language,
      voice: agent.voice?.voiceName || null
    });
    if (audio?.buffer) {
      const stored = await storeAudio(db, { conversation, messageId: assistantMessage.id, audio, language });
      finalMessage = stored.message;
      audioPath = stored.audioPath;
      audioUrl = stored.audioUrl;
    }

    const nextChannel = conversation.channel === 'mixed' || conversation.channel === channel ? conversation.channel : 'mixed';
    const { error: updateError } = await db.from('conversations')
      .update({ language, channel: nextChannel })
      .eq('id', conversation.id);
    checkError(updateError, 'Could not update conversation');

    return res.json({
      message: { ...finalMessage, audio_path: audioPath, audioPath },
      language,
      voiceLanguage: voiceForLanguage(language),
      audioUrl,
      audioPath
    });
  } catch (error) {
    return next(error);
  }
}

export async function submitFeedback(req, res, next) {
  try {
    const db = serviceDb();
    const { conversation } = await loadPublicConversation(db, req.params.token);
    const { data, error } = await db.from('feedback').insert({
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      rating: req.body.rating,
      comment: req.body.comment || null
    }).select('id,conversation_id,rating,comment,created_at').single();
    checkError(error, 'Could not save feedback');
    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
}

export async function requestHandoff(req, res, next) {
  try {
    const db = serviceDb();
    const { conversation } = await loadPublicConversation(db, req.params.token);
    const { data: request, error } = await db.from('human_support_requests').insert({
      conversation_id: conversation.id,
      workspace_id: conversation.workspace_id,
      status: 'open',
      reason: req.body.reason || null
    }).select('*').single();
    checkError(error, 'Could not create human support request');

    const { data: workspace, error: workspaceError } = await db.from('workspaces')
      .select('owner_id,name')
      .eq('id', conversation.workspace_id)
      .maybeSingle();
    checkError(workspaceError, 'Could not read workspace');

    await notify(db, {
      workspaceId: conversation.workspace_id,
      userId: workspace?.owner_id || null,
      type: 'human_support_request',
      title: 'Human support requested',
      body: req.body.reason || 'A conversation requested human support.',
      data: { conversationId: conversation.id, requestId: request.id }
    });
    await audit(db, {
      workspaceId: conversation.workspace_id,
      action: 'human_support.requested',
      entityType: 'human_support_request',
      entityId: request.id,
      metadata: { conversationId: conversation.id }
    });
    const { error: updateError } = await db.from('conversations')
      .update({ status: 'pending' })
      .eq('id', conversation.id);
    checkError(updateError, 'Could not update conversation');

    return res.status(201).json(request);
  } catch (error) {
    return next(error);
  }
}
