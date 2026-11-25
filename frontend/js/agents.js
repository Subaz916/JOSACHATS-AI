import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtDate, fmtNumber, asArray, openModal, closeModal, confirmAction, copyText, toast, h, debounce } from './app.js';
import { api } from './api.js';

const state = { agents: [], status: '', search: '' };

function visibleAgents() {
  const term = state.search.trim().toLowerCase();
  return state.agents.filter((agent) => {
    const status = String(agent?.status || '').toLowerCase();
    const text = [agent?.name, agent?.businessName, agent?.slug, agent?.publicUrl].join(' ').toLowerCase();
    return (!state.status || status === state.status) && (!term || text.includes(term));
  });
}

function publicUrl(agent) {
  return agent?.publicUrl || agent?.public_url || '';
}

function render() {
  const root = qs('#page-content');
  const rows = visibleAgents();
  root.innerHTML = `
    <div class="toolbar">
      <div class="search-field"><label for="agent-search">Search agents</label><input id="agent-search" type="search" placeholder="Name, slug, or link" value="${h(state.search)}"></div>
      <div class="field"><label for="agent-status-filter">Status</label>
        <select id="agent-status-filter">
          <option value="">All statuses</option>
          <option value="active"${state.status === 'active' ? ' selected' : ''}>Active</option>
          <option value="inactive"${state.status === 'inactive' ? ' selected' : ''}>Inactive</option>
          <option value="draft"${state.status === 'draft' ? ' selected' : ''}>Draft</option>
        </select>
      </div>
      <a class="button primary" href="create-agent.html">New agent</a>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Your agents</h2><p>${fmtNumber(rows.length)} shown</p></div></div>
      ${table([
        { label: 'Agent', key: 'name', render: (agent) => `<span class="cell-strong">${present(agent?.name || '—')}</span><span class="cell-muted">${present(agent?.businessName || agent?.slug || '')}</span>` },
        { label: 'Status', key: 'status', render: (agent) => badge(agent?.status || '—') },
        { label: 'Public URL', key: 'publicUrl', render: (agent) => `<span class="cell-muted">${present(publicUrl(agent) || '—')}</span>` },
        { label: 'Created', key: 'created_at', render: (agent) => fmtDate(agent?.created_at) },
        { label: 'Published', key: 'status', render: (agent) => `<label class="checkbox-row"><input type="checkbox" data-action="publish" data-id="${h(agent?.id || '')}"${agent?.status === 'active' ? ' checked' : ''} aria-label="Publish ${h(agent?.name || 'agent')}"></label>` },
        { label: 'Actions', key: 'id', render: (agent) => `
          <div class="cell-actions">
            <a class="button small" href="create-agent.html?edit=${encodeURIComponent(agent?.id || '')}">Edit</a>
            <button type="button" class="button small" data-action="copy" data-id="${h(agent?.id || '')}">Copy link</button>
            <button type="button" class="button small" data-action="qr" data-id="${h(agent?.id || '')}">QR</button>
            ${publicUrl(agent) ? `<a class="button small" href="${h(publicUrl(agent))}" target="_blank" rel="noopener">Preview</a>` : ''}
            <button type="button" class="button small danger" data-action="delete" data-id="${h(agent?.id || '')}">Delete</button>
          </div>
        ` }
      ], rows, { emptyTitle: 'No agents found', emptyMessage: 'Create a new agent or change the current filters.' })}
    </section>
  `;
  bind();
}

function findAgent(id) {
  return state.agents.find((agent) => agent?.id === id);
}

function bind() {
  qs('#agent-search')?.addEventListener('input', debounce((event) => {
    state.search = event.target.value;
    render();
    qs('#agent-search')?.focus();
  }, 200));
  qs('#agent-status-filter')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    render();
  });
  qs('#page-content')?.addEventListener('click', handleClick);
  qs('#page-content')?.addEventListener('change', handleChange);
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.dataset.action === 'publish') return;
  const agent = findAgent(button.dataset.id);
  if (!agent) return;
  const action = button.dataset.action;
  try {
    if (action === 'copy') {
      const url = publicUrl(agent);
      if (!url) throw new Error('This agent has no public URL');
      await copyText(url);
      toast('Public link copied', 'success');
    }
    if (action === 'qr') {
      const payload = await api(`/agents/${encodeURIComponent(agent.id)}/share`);
      openModal({
        title: `QR code for ${agent.name || 'agent'}`,
        body: `<div class="qr-modal"><img src="${h(payload?.qrDataUrl || '')}" alt="QR code"><p>${present(payload?.publicUrl || publicUrl(agent))}</p></div>`,
        footer: '<button type="button" class="button" data-modal-dismiss>Close</button>'
      });
      qs('[data-modal-dismiss]')?.addEventListener('click', closeModal);
    }
    if (action === 'delete') {
      if (!confirmAction(`Delete ${agent.name || 'this agent'}? This action cannot be undone.`)) return;
      await api(`/agents/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
      state.agents = state.agents.filter((item) => item?.id !== agent.id);
      toast('Agent deleted', 'success');
      render();
    }
  } catch (error) {
    toast(error?.message || 'Action failed', 'error');
  }
}

async function handleChange(event) {
  const input = event.target.closest('[data-action="publish"]');
  if (!input) return;
  const agent = findAgent(input.dataset.id);
  if (!agent) return;
  const status = input.checked ? 'active' : 'inactive';
  try {
    const payload = await api(`/agents/${encodeURIComponent(agent.id)}/publish`, { method: 'POST', body: { status } });
    Object.assign(agent, payload?.agent || { status });
    toast(`Agent set to ${status}`, 'success');
    render();
  } catch (error) {
    input.checked = !input.checked;
    toast(error?.message || 'Could not update status', 'error');
  }
}

async function loadAgents() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const payload = await api('/agents');
    state.agents = asArray(payload, ['agents']);
    render();
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'agents' }).then(loadAgents).catch(showPageError);
