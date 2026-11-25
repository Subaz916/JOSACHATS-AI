import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtNumber, fmtDateTime, asArray, openModal, closeModal, toast, h, buildQuery } from './app.js';
import { api } from './api.js';
import { currentUser } from './supabase.js';

const state = { requests: [], status: '' };
let bound = false;

function visibleRequests() {
  return state.requests.filter((item) => !state.status || item?.status === state.status);
}

function statuses() {
  return [...new Set(state.requests.map((item) => item?.status).filter(Boolean))].sort();
}

function conversationOf(request) {
  return request?.conversations || request?.conversation || {};
}

function render() {
  const root = qs('#page-content');
  const rows = visibleRequests();
  root.innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="support-status">Status</label><select id="support-status"><option value="">All statuses</option>${statuses().map((status) => `<option value="${h(status)}"${state.status === status ? ' selected' : ''}>${present(status)}</option>`).join('')}</select></div>
      <span class="cell-muted">${fmtNumber(rows.length)} requests shown</span>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Escalation inbox</h2><p>Assign, resolve, or return requests to AI</p></div></div>
      ${table([
        { label: 'Customer', key: 'conversation_id', render: (request) => `<span class="cell-strong">${present(conversationOf(request)?.customer_identifier || request?.conversation_id || '—')}</span><span class="cell-muted">${present(conversationOf(request)?.id || '')}</span>` },
        { label: 'Agent', key: 'agent', render: (request) => present(conversationOf(request)?.agents?.name || '—') },
        { label: 'Reason', key: 'reason', render: (request) => `<span class="cell-muted">${present(request?.reason || '—')}</span>` },
        { label: 'Assigned', key: 'assigned_to', render: (request) => present(request?.assigned_to || '—') },
        { label: 'Status', key: 'status', render: (request) => badge(request?.status || '—') },
        { label: 'Created', key: 'created_at', render: (request) => fmtDateTime(request?.created_at) },
        { label: 'Actions', key: 'id', render: (request) => `<div class="cell-actions"><button type="button" class="button small" data-action="assign" data-id="${h(request?.id || '')}">Assign</button><button type="button" class="button small" data-action="resolve" data-id="${h(request?.id || '')}">Resolve</button><button type="button" class="button small" data-action="return" data-id="${h(request?.id || '')}">Return to AI</button></div>` }
      ], rows, { emptyTitle: 'No support requests', emptyMessage: 'Escalations from agents will appear here.' })}
    </section>
  `;
  qs('#support-status')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    render();
  });
}

async function openUpdate(request, action) {
  const titles = {
    assign: 'Assign request',
    resolve: 'Resolve request',
    return: 'Return request to AI'
  };
  let user = {};
  try {
    user = (await currentUser()) || {};
  } catch {
    user = {};
  }
  const assignField = action === 'assign' ? `
    <div class="field full"><label for="support-assignee">Assignee user ID</label><input id="support-assignee" name="assignedTo" required value="${h(request?.assigned_to || user?.id || '')}" placeholder="User UUID"></div>
  ` : '';
  openModal({
    title: titles[action] || 'Update request',
    body: `
      <form id="support-form" class="form-grid">
        ${assignField}
        <div class="field full"><label for="support-notes">Notes</label><textarea id="support-notes" name="notes" maxlength="5000">${h(request?.notes || '')}</textarea></div>
        <div class="field full"><button type="submit" class="button primary">Save</button></div>
      </form>
    `,
    footer: '<button type="button" class="button" data-modal-dismiss>Cancel</button>'
  });
  qs('[data-modal-dismiss]')?.addEventListener('click', closeModal);
  qs('#support-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = {
      status: action === 'return' ? 'returned' : action === 'resolve' ? 'resolved' : 'assigned',
      notes: String(formData.get('notes') || '').trim()
    };
    if (action === 'assign') body.assignedTo = String(formData.get('assignedTo') || '').trim();
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const payload = await api(`/human-support/${encodeURIComponent(request.id)}`, { method: 'PATCH', body });
      Object.assign(request, payload?.request || payload || {}, body);
      closeModal();
      toast(`Request ${body.status}`, 'success');
      render();
    } catch (error) {
      toast(error?.message || 'Could not update request', 'error');
    }
  });
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const request = state.requests.find((item) => item?.id === button.dataset.id);
  if (!request) return;
  await openUpdate(request, button.dataset.action);
}

async function loadRequests() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const payload = await api(`/human-support${buildQuery({ status: state.status })}`);
    state.requests = asArray(payload, ['requests']);
    render();
    if (!bound) {
      document.addEventListener('click', handleClick);
      bound = true;
    }
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'human-support' }).then(loadRequests).catch(showPageError);
