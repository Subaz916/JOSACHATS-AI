import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtNumber, fmtMoney, fmtDate, asArray, openModal, closeModal, confirmAction, toast, h, debounce, buildQuery } from './app.js';
import { api } from './api.js';

const state = { tab: 'products', products: [], services: [], agents: [], search: '', agentId: '', available: '' };

function currentItems() {
  return state[state.tab].filter((item) => !state.available || String(item?.available ?? true) === state.available);
}

function agentLabel(id) {
  const agent = state.agents.find((item) => item?.id === id);
  return agent?.name || agent?.slug || '';
}

function render() {
  const root = qs('#page-content');
  root.innerHTML = `
    <section class="panel">
      <div class="tabs" role="tablist">
        <button type="button" class="tab-button${state.tab === 'products' ? ' is-active' : ''}" data-tab="products">Products</button>
        <button type="button" class="tab-button${state.tab === 'services' ? ' is-active' : ''}" data-tab="services">Services</button>
      </div>
    </section>
    <div class="toolbar">
      <div class="search-field"><label for="catalog-search">Search</label><input id="catalog-search" type="search" placeholder="Name, description, category" value="${h(state.search)}"></div>
      <div class="field"><label for="catalog-agent">Agent</label><select id="catalog-agent"><option value="">All agents</option>${state.agents.map((agent) => `<option value="${h(agent?.id || '')}"${state.agentId === agent?.id ? ' selected' : ''}>${present(agent?.name || '—')}</option>`).join('')}</select></div>
      <div class="field"><label for="catalog-available">Availability</label><select id="catalog-available"><option value="">All</option><option value="true"${state.available === 'true' ? ' selected' : ''}>Available</option><option value="false"${state.available === 'false' ? ' selected' : ''}>Unavailable</option></select></div>
      <button type="button" class="button primary" data-action="add">Add ${state.tab === 'products' ? 'product' : 'service'}</button>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>${state.tab === 'products' ? 'Products' : 'Services'}</h2><p>${fmtNumber(currentItems().length)} shown</p></div></div>
      ${table([
        { label: 'Name', key: 'name', render: (item) => `<span class="cell-strong">${present(item?.name || '—')}</span><span class="cell-muted">${present(item?.description || '').slice(0, 100)}</span>` },
        { label: 'Category', key: 'category', render: (item) => present(item?.category || '—') },
        { label: 'Price', key: 'price_pkr', render: (item) => fmtMoney(item?.price_pkr) },
        { label: 'Available', key: 'available', render: (item) => badge(item?.available === false ? 'inactive' : 'active') },
        { label: 'Agent', key: 'agent_id', render: (item) => present(agentLabel(item?.agent_id) || 'All agents') },
        { label: 'Added', key: 'created_at', render: (item) => fmtDate(item?.created_at) },
        { label: 'Actions', key: 'id', render: (item) => `<div class="cell-actions"><button type="button" class="button small" data-action="edit" data-kind="${state.tab}" data-id="${h(item?.id || '')}">Edit</button><button type="button" class="button small danger" data-action="delete" data-kind="${state.tab}" data-id="${h(item?.id || '')}">Delete</button></div>` }
      ], currentItems(), { emptyTitle: `No ${state.tab} found`, emptyMessage: 'Add an item or change the current filters.' })}
    </section>
  `;
  bindFilters();
}

function bindFilters() {
  qs('#catalog-search')?.addEventListener('input', debounce((event) => {
    state.search = event.target.value;
    loadAll();
  }, 250));
  qs('#catalog-agent')?.addEventListener('change', (event) => {
    state.agentId = event.target.value;
    loadAll();
  });
  qs('#catalog-available')?.addEventListener('change', (event) => {
    state.available = event.target.value;
    render();
  });
}

function openForm(item = null) {
  const kind = state.tab;
  const isProduct = kind === 'products';
  const label = isProduct ? 'product' : 'service';
  const body = `
    <form id="catalog-form" class="form-grid">
      <div class="field"><label for="catalog-name">Name</label><input id="catalog-name" name="name" required minlength="2" maxlength="200" value="${h(item?.name || '')}"></div>
      <div class="field"><label for="catalog-category">Category</label><input id="catalog-category" name="category" maxlength="120" value="${h(item?.category || '')}"></div>
      <div class="field"><label for="catalog-price">Price (PKR)</label><input id="catalog-price" name="pricePkr" type="number" min="0" step="1" value="${h(item?.price_pkr ?? item?.pricePkr ?? '')}"></div>
      <div class="field"><label for="catalog-agent-form">Agent</label><select id="catalog-agent-form" name="agentId"><option value="">All agents</option>${state.agents.map((agent) => `<option value="${h(agent?.id || '')}"${item?.agent_id === agent?.id ? ' selected' : ''}>${present(agent?.name || '—')}</option>`).join('')}</select></div>
      <div class="field full"><label for="catalog-description">Description</label><textarea id="catalog-description" name="description" maxlength="8000">${h(item?.description || '')}</textarea></div>
      ${isProduct ? `<div class="field full"><label for="catalog-variations">Variations</label><textarea id="catalog-variations" name="variations" maxlength="4000">${h(item?.variations || '')}</textarea></div>` : ''}
      <div class="field full"><label for="catalog-image">Image URL</label><input id="catalog-image" name="imageUrl" maxlength="500" value="${h(item?.image_url || item?.imageUrl || '')}"></div>
      <label class="checkbox-row full"><input type="checkbox" name="available"${item?.available === false ? '' : ' checked'}> Available</label>
      <div class="field full"><button type="submit" class="button primary">${item ? `Save ${label}` : `Add ${label}`}</button></div>
    </form>
  `;
  openModal({ title: item ? `Edit ${label}` : `Add ${label}`, body, footer: '<button type="button" class="button" data-modal-dismiss>Cancel</button>', size: 'wide' });
  qs('#catalog-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      pricePkr: formData.get('pricePkr') === '' ? null : Number(formData.get('pricePkr')),
      category: String(formData.get('category') || '').trim(),
      available: formData.get('available') === 'on',
      imageUrl: String(formData.get('imageUrl') || '').trim(),
      agentId: formData.get('agentId') || null
    };
    if (isProduct) payload.variations = String(formData.get('variations') || '').trim();
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await api(item ? `/${kind}/${encodeURIComponent(item.id)}` : `/${kind}`, { method: item ? 'PATCH' : 'POST', body: payload });
      closeModal();
      toast(item ? `${label} updated` : `${label} added`, 'success');
      await loadAll();
    } catch (error) {
      toast(error?.message || `Could not save ${label}`, 'error');
    }
  });
  qs('[data-modal-dismiss]')?.addEventListener('click', closeModal);
}

async function handleClick(event) {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    render();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'add') {
    openForm();
    return;
  }
  const kind = button.dataset.kind || state.tab;
  const id = button.dataset.id;
  const item = state[kind].find((entry) => entry?.id === id);
  if (!item) return;
  if (action === 'edit') {
    state.tab = kind;
    openForm(item);
    return;
  }
  if (action === 'delete') {
    const label = kind === 'products' ? 'product' : 'service';
    if (!confirmAction(`Delete this ${label}?`)) return;
    try {
      await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state[kind] = state[kind].filter((entry) => entry?.id !== id);
      toast(`${label} deleted`, 'success');
      render();
    } catch (error) {
      toast(error?.message || `Could not delete ${label}`, 'error');
    }
  }
}

async function loadAll() {
  const query = buildQuery({ search: state.search, agentId: state.agentId });
  const [products, services] = await Promise.all([
    api(`/products${query}`),
    api(`/services${query}`)
  ]);
  state.products = asArray(products, ['products']);
  state.services = asArray(services, ['services']);
  render();
}

async function loadPage() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const agents = await api('/agents');
    state.agents = asArray(agents, ['agents']);
    await loadAll();
    document.addEventListener('click', handleClick);
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'products' }).then(loadPage).catch(showPageError);
