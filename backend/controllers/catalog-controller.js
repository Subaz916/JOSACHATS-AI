import { workspaceFor, countRows, requireUuid, getAgentForWorkspace } from './shared.js';
import { HttpError } from '../utils/http-error.js';

const productColumns = {
  name: 'name',
  description: 'description',
  pricePkr: 'price_pkr',
  category: 'category',
  available: 'available',
  variations: 'variations',
  imageUrl: 'image_url'
};

const serviceColumns = {
  name: 'name',
  description: 'description',
  pricePkr: 'price_pkr',
  category: 'category',
  available: 'available',
  imageUrl: 'image_url'
};

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function agentRequest(req) {
  const provided = req.catalogAgentIdProvided || has(req.body, 'agentId');
  const value = req.catalogAgentIdProvided ? req.catalogAgentId : req.body?.agentId;
  return { provided, value: value || null };
}

function searchTerm(search) {
  return String(search || '').trim().replace(/[%,().']/g, ' ').trim();
}

function catalogRow(body, workspaceId, agentId, isProduct) {
  const row = {
    workspace_id: workspaceId,
    agent_id: agentId || null,
    name: body.name,
    description: body.description ?? null,
    price_pkr: body.pricePkr ?? null,
    category: body.category ?? null,
    available: body.available ?? true,
    image_url: body.imageUrl ?? null
  };
  if (isProduct) row.variations = body.variations ?? null;
  return row;
}

function catalogPatch(body, isProduct) {
  const columns = isProduct ? productColumns : serviceColumns;
  const patch = {};
  for (const [key, column] of Object.entries(columns)) {
    if (has(body, key)) patch[column] = body[key];
  }
  return patch;
}

async function listCatalog(req, res, next, table, key) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agentId = req.query.agentId || null;
    if (agentId) await getAgentForWorkspace(db, workspaceId, agentId);

    const filters = [['workspace_id', workspaceId]];
    if (agentId) filters.push(['agent_id', agentId]);
    const total = await countRows(db, table, filters);
    if (!total) return res.json({ [key]: [] });

    let query = db.from(table)
      .select('*')
      .eq('workspace_id', workspaceId);
    if (agentId) query = query.eq('agent_id', agentId);

    const term = searchTerm(req.query.search);
    if (term) {
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message || `Could not list ${key}`);

    res.json({ [key]: data || [] });
  } catch (error) {
    next(error);
  }
}

async function createCatalog(req, res, next, table, key, isProduct) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const agent = agentRequest(req);
    const agentId = agent.value;
    if (agentId) await getAgentForWorkspace(db, workspaceId, agentId);

    const row = catalogRow(req.body || {}, workspaceId, agentId, isProduct);
    const { data, error } = await db.from(table).insert(row).select('*').single();
    if (error) throw new Error(error.message || `Could not create ${key.replace(/s$/, '')}`);

    res.status(201).json({ [key.replace(/s$/, '')]: data });
  } catch (error) {
    next(error);
  }
}

async function updateCatalog(req, res, next, table, key, isProduct) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const id = requireUuid(req.params.id, `${key.replace(/s$/, '')} id`);
    const { data: existing, error: readError } = await db.from(table)
      .select('id')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (readError) throw new Error(readError.message || `Could not read ${key.replace(/s$/, '')}`);
    if (!existing) throw new HttpError(404, `${key.replace(/s$/, '')} not found`);

    const agent = agentRequest(req);
    const patch = catalogPatch(req.body || {}, isProduct);
    if (agent.provided) {
      if (agent.value) await getAgentForWorkspace(db, workspaceId, agent.value);
      patch.agent_id = agent.value;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, `No ${key} fields to update`);

    const { data, error } = await db.from(table)
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();
    if (error) throw new Error(error.message || `Could not update ${key.replace(/s$/, '')}`);
    if (!data) throw new HttpError(404, `${key.replace(/s$/, '')} not found`);

    res.json({ [key.replace(/s$/, '')]: data });
  } catch (error) {
    next(error);
  }
}

async function deleteCatalog(req, res, next, table, key) {
  try {
    const db = req.db;
    const { workspace_id: workspaceId } = await workspaceFor(db, req.user.id);
    const id = requireUuid(req.params.id, `${key.replace(/s$/, '')} id`);

    const { data, error } = await db.from(table)
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message || `Could not delete ${key.replace(/s$/, '')}`);
    if (!data) throw new HttpError(404, `${key.replace(/s$/, '')} not found`);

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function listProducts(req, res, next) {
  return listCatalog(req, res, next, 'products', 'products');
}

export async function createProduct(req, res, next) {
  return createCatalog(req, res, next, 'products', 'products', true);
}

export async function updateProduct(req, res, next) {
  return updateCatalog(req, res, next, 'products', 'products', true);
}

export async function deleteProduct(req, res, next) {
  return deleteCatalog(req, res, next, 'products', 'products');
}

export async function listServices(req, res, next) {
  return listCatalog(req, res, next, 'services', 'services');
}

export async function createService(req, res, next) {
  return createCatalog(req, res, next, 'services', 'services', false);
}

export async function updateService(req, res, next) {
  return updateCatalog(req, res, next, 'services', 'services', false);
}

export async function deleteService(req, res, next) {
  return deleteCatalog(req, res, next, 'services', 'services');
}
