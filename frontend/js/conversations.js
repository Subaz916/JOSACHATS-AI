import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtNumber, fmtDateTime, asArray, openModal, copyText, toast, h, debounce, downloadText, rawToText, buildQuery } from './app.js';
import { api } from './api.js';

const state = { conversations: [], agents: [], status: '', agentId: '', language: '', search: '' };
let bound = false;

function agentName(id) {
  const agent = state.agents.find((item) => item?.id === id);
  return agent?.name || agent?.slug || '';
}

function visibleConversations() {
  const term = state.search.trim().toLowerCase();
  return state.conversations.filter((item) => {
    const text = [item?.id, item?.customer_identifier, item?.channel, item?.language, agentName(item?.agent_id), item?.agents?.name].join(' ').toLowerCase();
    return (!state.status || item?.status === state.status)
      && (!state.agentId || item?.agent_id === state.agentId)
      && (!state.language || item?.language === state.language)
      && (!term || text.includes(term));
  });
}

function uniqueValues(key) {
  return [...new Set(state.conversations.map((item) => item?.[key]).filter(Boolean))].sort();
}

function render() {
  const root = qs('#page-content');
  const rows = visibleConversations();
  root.innerHTML = `
    <div class="toolbar">
      <div class="search-field"><label for="conversation-search">Search</label><input id="conversation-search" type="search" placeholder="ID, customer, agent" value="${h(state.search)}"></div>
      <div class="field"><label for="conversation-status">Status</label><select id="conversation-status"><option value="">All statuses</option>${uniqueValues('status').map((value) => `<option value="${h(value)}"${state.status === value ? ' selected' : ''}>${present(value)}</option>`).join('')}</select></div>
      <div class="field"><label for="conversation-agent">Agent</label><select id="conversation-agent"><option value="">All agents</option>${state.agents.map((agent) => `<option value="${h(agent?.id || '')}"${state.agentId === agent?.id ? ' selected' : ''}>${present(agent?.name || '—')}</option>`).join('')}</select></div>
      <div class="field"><label for="conversation-language">Language</label><select id="conversation-language"><option value="">All languages</option>${uniqueValues('language').map((value) => `<option value="${h(value)}"${state.language === value ? ' selected' : ''}>${present(value)}</option>`).join('')}</select></div>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Conversation inbox</h2><p>${fmtNumber(rows.length)} shown</p></div></div>
      ${table([
        { label: 'Conversation', key: 'id', render: (item) => `<span class="cell-strong">${present(item?.customer_identifier || item?.id || '—')}</span><span class="cell-muted">${present(item?.id || '')}</span>` },
        { label: 'Agent', key: 'agent_id', render: (item) => present(item?.agents?.name || agentName(item?.agent_id) || '—') },
        { label: 'Channel', key: 'channel', render: (item) => present(item?.channel || '—') },
        { label: 'Language', key: 'language', render: (item) => present(item?.language || '—') },
        { label: 'Status', key: 'status', render: (item) => badge(item?.status || '—') },
        { label: 'Created', key: 'created_at', render: (item) => fmtDateTime(item?.created_at) },
        { label: 'Actions', key: 'id', render: (item) => `<div class="cell-actions"><button type="button" class="button small" data-action="view" data-id="${h(item?.id || '')}">Transcript</button><button type="button" class="button small" data-action="export" data-id="${h(item?.id || '')}">Export</button></div>` }
      ], rows, { emptyTitle: 'No conversations found', emptyMessage: 'Adjust filters or wait for new customer activity.' })}
    </section>
  `;
  bindFilters();
}

function bindFilters() {
  qs('#conversation-search')?.addEventListener('input', debounce((event) => {
    state.search = event.target.value;
    render();
    qs('#conversation-search')?.focus();
  }, 200));
  qs('#conversation-status')?.addEventListener('change', (event) => {
    state.status = event.target.value;
    render();
  });
  qs('#conversation-agent')?.addEventListener('change', (event) => {
    state.agentId = event.target.value;
    render();
  });
  qs('#conversation-language')?.addEventListener('change', (event) => {
    state.language = event.target.value;
    render();
  });
}

function closeDrawer() {
  qs('#drawer-root')?.replaceChildren();
}

function renderDetail(payload) {
  const conversation = payload?.conversation || {};
  const messages = asArray(payload?.messages, ['messages']);
  const feedback = asArray(payload?.feedback, ['feedback']);
  const handoffs = asArray(payload?.handoffRequests, ['handoffRequests']);
  const root = qs('#drawer-root');
  root.innerHTML = `
    <div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Conversation transcript">
      <div class="drawer-head"><div><h2>Transcript</h2><p>${present(conversation?.customer_identifier || conversation?.id || '—')}</p></div><button type="button" class="icon-button" data-drawer-close aria-label="Close">×</button></div>
      <div class="drawer-body">
        <div class="detail-grid">
          <div class="detail-item"><span>Status</span><strong>${badge(conversation?.status || '—')}</strong></div>
          <div class="detail-item"><span>Agent</span><strong>${present(conversation?.agents?.name || agentName(conversation?.agent_id) || '—')}</strong></div>
          <div class="detail-item"><span>Channel</span><strong>${present(conversation?.channel || '—')}</strong></div>
          <div class="detail-item"><span>Language</span><strong>${present(conversation?.language || '—')}</strong></div>
          <div class="detail-item"><span>Created</span><strong>${fmtDateTime(conversation?.created_at)}</strong></div>
          <div class="detail-item"><span>Updated</span><strong>${fmtDateTime(conversation?.updated_at)}</strong></div>
        </div>
        <div class="cell-actions">
          <button type="button" class="button small" data-action="export" data-id="${h(conversation?.id || '')}">Export CSV</button>
          <button type="button" class="button small" data-action="copy-id" data-id="${h(conversation?.id || '')}">Copy ID</button>
          <button type="button" class="button small danger" data-action="archive" data-id="${h(conversation?.id || '')}">Archive</button>
        </div>
        <section><h3>Messages</h3><div class="message-list">${messages.length ? messages.map((message) => `
          <article class="message ${h(message?.role || '')}">
            <small>${present(message?.role || '—')} · ${fmtDateTime(message?.created_at)}</small>
            <div>${present(message?.content || '—')}</div>
            ${message?.audio_path ? `<audio controls src="${h(message.audio_path)}"></audio>` : ''}
          </article>
        `).join('') : '<div class="empty-state"><strong>No messages</strong><span>This conversation has no transcript.</span></div>'}</div></section>
        <section><h3>Feedback</h3>${feedback.length ? feedback.map((item) => `<div class="notice"><strong>${fmtNumber(item?.rating || '—')} / 5</strong><p>${present(item?.comment || 'No comment')}</p><time>${fmtDateTime(item?.created_at)}</time></div>`).join('') : '<div class="empty-state"><strong>No feedback</strong><span>No rating was submitted.</span></div>'}</section>
        <section><h3>Human support</h3>${handoffs.length ? handoffs.map((item) => `<div class="notice"><strong>${present(item?.status || '—')}</strong><p>${present(item?.reason || item?.notes || 'No notes')}</p></div>`).join('') : '<div class="empty-state"><strong>No handoffs</strong><span>This conversation stayed with AI.</span></div>'}</section>
      </div>
    </aside>
  `;
  qsaDrawerClose();
}

function qsaDrawerClose() {
  document.querySelectorAll('[data-drawer-close]').forEach((element) => element.addEventListener('click', closeDrawer));
}

async function openConversation(id) {
  try {
    const payload = await api(`/conversations/${encodeURIComponent(id)}`);
    renderDetail(payload);
  } catch (error) {
    toast(error?.message || 'Could not open transcript', 'error');
  }
}

async function exportConversation(id) {
  try {
    const response = await api(`/conversations/${encodeURIComponent(id)}/export${buildQuery({ format: 'csv' })}`, { raw: true });
    const text = await rawToText(response);
    await downloadText(text, `conversation-${id}.csv`, 'text/csv');
    toast('CSV export downloaded', 'success');
  } catch (error) {
    toast(error?.message || 'Could not export conversation', 'error');
  }
}

async function handleClick(event) {
  const close = event.target.closest('[data-drawer-close]');
  if (close) {
    closeDrawer();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.dataset.action === 'view') await openConversation(id);
    if (button.dataset.action === 'export') await exportConversation(id);
    if (button.dataset.action === 'copy-id') {
      await copyText(id);
      toast('Conversation ID copied', 'success');
    }
    if (button.dataset.action === 'archive') {
      await api(`/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'archived' } });
      const local = state.conversations.find((item) => item?.id === id);
      if (local) local.status = 'archived';
      closeDrawer();
      render();
      toast('Conversation archived', 'success');
    }
  } catch (error) {
    toast(error?.message || 'Action failed', 'error');
  }
}

async function loadConversations() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const [conversationPayload, agentPayload] = await Promise.all([
      api(`/conversations${buildQuery({ status: state.status, agentId: state.agentId, language: state.language })}`),
      api('/agents')
    ]);
    state.conversations = asArray(conversationPayload, ['conversations']);
    state.agents = asArray(agentPayload, ['agents']);
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

initApp({ active: 'conversations' }).then(loadConversations).catch(showPageError);
