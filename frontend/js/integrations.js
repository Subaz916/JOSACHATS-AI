import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtNumber, fmtDate, asArray, openModal, closeModal, confirmAction, toast, copyText, h } from './app.js';
import { api } from './api.js';

const state = { agents: [], integrations: [], agentId: '' };
let bound = false;

function selectedAgent() {
  return state.agents.find((agent) => agent?.id === state.agentId) || state.agents[0] || null;
}

function publicUrl(agent) {
  return agent?.publicUrl || agent?.public_url || '';
}

function widgetScript(agent) {
  if (!agent?.id) return '';
  const source = publicUrl(agent) || `${window.location.origin}/chat/${agent.slug || ''}`;
  try {
    const url = new URL(source);
    url.pathname = '/widget.js';
    url.search = '';
    url.searchParams.set('agent', agent.id);
    return url.toString();
  } catch {
    return `${window.location.origin}/widget.js?agent=${encodeURIComponent(agent.id)}`;
  }
}

function embedCode(agent) {
  if (!agent?.id) return '';
  return `<script src="${widgetScript(agent)}" data-agent-id="${agent.id}" async><\/script>\n<div id="josa-chat-widget" data-agent-id="${agent.id}"></div>`;
}

function configText(value) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return '{}';
  }
}

function render() {
  const root = qs('#page-content');
  const agent = selectedAgent();
  const code = embedCode(agent);
  root.innerHTML = `
    <div class="two-column">
      <section class="panel">
        <div class="panel-head"><div><h2>Embed generator</h2><p>Add the widget to any website</p></div></div>
        <div class="field"><label for="embed-agent">Agent</label><select id="embed-agent"><option value="">Select an agent</option>${state.agents.map((item) => `<option value="${h(item?.id || '')}"${agent?.id === item?.id ? ' selected' : ''}>${present(item?.name || '—')}</option>`).join('')}</select></div>
        <div class="field" style="margin-top:14px"><label for="embed-code">Embed code</label><textarea id="embed-code" rows="8" readonly>${h(code)}</textarea></div>
        <div class="cell-actions" style="margin-top:12px"><button type="button" class="button primary" data-action="copy-code"${code ? '' : ' disabled'}>Copy code</button><button type="button" class="button" data-action="open-integration">Save integration</button></div>
        <div class="notice" style="margin-top:14px">Script source: ${present(widgetScript(agent) || '—')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Live preview</h2><p>${present(agent?.name || 'Choose an agent')}</p></div>${publicUrl(agent) ? `<a class="button small" href="${h(publicUrl(agent))}" target="_blank" rel="noopener">Open chat</a>` : ''}</div>
        ${publicUrl(agent) ? `<iframe class="preview-frame" src="${h(publicUrl(agent))}" title="Agent chat preview" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>` : '<div class="empty-state"><strong>No public URL</strong><span>Publish or create an agent to preview it.</span></div>'}
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Configured integrations</h2><p>${fmtNumber(state.integrations.length)} saved</p></div><button type="button" class="button primary" data-action="add-integration">Add integration</button></div>
      ${table([
        { label: 'Type', key: 'type', render: (item) => `<span class="cell-strong">${present(item?.type || '—')}</span>` },
        { label: 'Agent', key: 'agent_id', render: (item) => present(agentName(item?.agent_id) || 'All agents') },
        { label: 'Config', key: 'config', render: (item) => `<span class="cell-muted">${present(configText(item?.config).slice(0, 120))}</span>` },
        { label: 'Status', key: 'is_active', render: (item) => badge(item?.is_active === false ? 'inactive' : 'active') },
        { label: 'Updated', key: 'updated_at', render: (item) => fmtDate(item?.updated_at) }
      ], state.integrations, { emptyTitle: 'No integrations yet', emptyMessage: 'Save an integration to track it here.' })}
    </section>
  `;
  qs('#embed-agent')?.addEventListener('change', (event) => {
    state.agentId = event.target.value;
    render();
  });
}

function agentName(id) {
  const agent = state.agents.find((item) => item?.id === id);
  return agent?.name || agent?.slug || '';
}

function openIntegrationForm() {
  const agent = selectedAgent();
  openModal({
    title: 'Add integration',
    body: `
      <form id="integration-form" class="form-grid">
        <div class="field"><label for="integration-agent">Agent</label><select id="integration-agent" name="agentId"><option value="">All agents</option>${state.agents.map((item) => `<option value="${h(item?.id || '')}"${agent?.id === item?.id ? ' selected' : ''}>${present(item?.name || '—')}</option>`).join('')}</select></div>
        <div class="field"><label for="integration-type">Type</label><select id="integration-type" name="type"><option value="embed">embed</option><option value="widget">widget</option><option value="webhook">webhook</option><option value="zapier">zapier</option></select></div>
        <div class="field full"><label for="integration-config">Config JSON</label><textarea id="integration-config" name="config" rows="6">{}</textarea></div>
        <label class="checkbox-row full"><input type="checkbox" name="isActive" checked> Active</label>
        <div class="field full"><button type="submit" class="button primary">Save integration</button></div>
      </form>
    `,
    footer: '<button type="button" class="button" data-modal-dismiss>Cancel</button>',
    size: 'wide'
  });
  qs('[data-modal-dismiss]')?.addEventListener('click', closeModal);
  qs('#integration-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    let config;
    try {
      config = JSON.parse(String(formData.get('config') || '{}'));
    } catch {
      toast('Config must be valid JSON', 'error');
      return;
    }
    const payload = {
      agentId: formData.get('agentId') || null,
      type: String(formData.get('type') || '').trim(),
      config,
      isActive: formData.get('isActive') === 'on'
    };
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await api('/integrations', { method: 'POST', body: payload });
      closeModal();
      await loadIntegrations();
      toast('Integration saved', 'success');
    } catch (error) {
      toast(error?.message || 'Could not save integration', 'error');
    }
  });
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'copy-code') {
      await copyText(embedCode(selectedAgent()));
      toast('Embed code copied', 'success');
    }
    if (button.dataset.action === 'add-integration' || button.dataset.action === 'open-integration') {
      openIntegrationForm();
    }
    if (button.dataset.action === 'delete-integration') {
      if (!confirmAction('Delete this integration?')) return;
      toast('Integrations are managed from the saved type settings', 'info');
    }
  } catch (error) {
    toast(error?.message || 'Action failed', 'error');
  }
}

async function loadIntegrations() {
  const payload = await api('/integrations');
  state.integrations = asArray(payload, ['integrations']);
  render();
}

async function loadPage() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const [agents, integrations] = await Promise.all([api('/agents'), api('/integrations')]);
    state.agents = asArray(agents, ['agents']);
    state.integrations = asArray(integrations, ['integrations']);
    state.agentId = state.agents[0]?.id || '';
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

initApp({ active: 'integrations' }).then(loadPage).catch(showPageError);
