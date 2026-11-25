import { initApp, showPageError, qs, safeSetLoading, table, badge, present, fmtNumber, fmtDate, asArray, confirmAction, toast, h, buildQuery } from './app.js';
import { api } from './api.js';

const state = { sources: [], agents: [], agentId: '' };
let bound = false;

const TYPES = ['manual', 'faq', 'pdf', 'docx', 'txt', 'url', 'product', 'service', 'pricing', 'terms'];

function agentLabel(id) {
  const agent = state.agents.find((item) => item?.id === id);
  return agent?.name || agent?.slug || '';
}

function sourceContent(source) {
  return source?.content || source?.url || source?.file_name || '—';
}

function render() {
  const root = qs('#page-content');
  root.innerHTML = `
    <div class="two-column">
      <section class="panel">
        <div class="panel-head"><div><h2>Add knowledge source</h2><p>Upload files, paste content, or link a page</p></div></div>
        <form id="knowledge-form" class="form-grid">
          <div class="field"><label for="knowledge-title">Title</label><input id="knowledge-title" name="title" required minlength="2" maxlength="200" placeholder="Refund policy"></div>
          <div class="field"><label for="knowledge-type">Type</label><select id="knowledge-type" name="type">${TYPES.map((type) => `<option value="${type}">${present(type)}</option>`).join('')}</select></div>
          <div class="field full"><label for="knowledge-agent">Agent</label><select id="knowledge-agent" name="agentId"><option value="">All agents</option>${state.agents.map((agent) => `<option value="${h(agent?.id || '')}">${present(agent?.name || '—')}</option>`).join('')}</select></div>
          <div class="field full" id="knowledge-content-field"><label for="knowledge-content">Content</label><textarea id="knowledge-content" name="content" placeholder="Paste answers, policies, or FAQs"></textarea></div>
          <div class="field full" id="knowledge-url-field" hidden><label for="knowledge-url">URL</label><input id="knowledge-url" name="url" type="url" placeholder="https://example.com/help"></div>
          <div class="field full" id="knowledge-file-field" hidden><label for="knowledge-file">File</label><input id="knowledge-file" name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"></div>
          <div class="field full"><button type="submit" class="button primary">Add source</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Sources</h2><p>${fmtNumber(state.sources.length)} available</p></div></div>
        <div class="field"><label for="knowledge-filter">Filter by agent</label><select id="knowledge-filter"><option value="">All agents</option>${state.agents.map((agent) => `<option value="${h(agent?.id || '')}"${state.agentId === agent?.id ? ' selected' : ''}>${present(agent?.name || '—')}</option>`).join('')}</select></div>
        <div class="toolbar" style="margin-top:12px"><span class="cell-muted">Filter changes reload sources from the API.</span></div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>Knowledge library</h2><p>Documents used to ground agent answers</p></div></div>
      ${table([
        { label: 'Title', key: 'title', render: (source) => `<span class="cell-strong">${present(source?.title || '—')}</span><span class="cell-muted">${present(sourceContent(source)).slice(0, 120)}</span>` },
        { label: 'Type', key: 'type', render: (source) => badge(source?.type || '—') },
        { label: 'Agent', key: 'agent_id', render: (source) => present(agentLabel(source?.agent_id) || 'All agents') },
        { label: 'Added', key: 'created_at', render: (source) => fmtDate(source?.created_at) },
        { label: 'Actions', key: 'id', render: (source) => `<div class="cell-actions">${source?.url ? `<a class="button small" href="${h(source.url)}" target="_blank" rel="noopener">Open</a>` : ''}<button type="button" class="button small danger" data-action="delete-source" data-id="${h(source?.id || '')}">Delete</button></div>` }
      ], state.sources, { emptyTitle: 'No knowledge sources', emptyMessage: 'Add a document, FAQ, or URL to improve answers.' })}
    </section>
  `;
  bindForm();
}

function updateTypeFields(type) {
  const fileTypes = ['pdf', 'docx', 'txt'];
  qs('#knowledge-content-field')?.toggleAttribute('hidden', type === 'url' || fileTypes.includes(type));
  qs('#knowledge-url-field')?.toggleAttribute('hidden', type !== 'url');
  qs('#knowledge-file-field')?.toggleAttribute('hidden', !fileTypes.includes(type));
}

function bindForm() {
  const type = qs('#knowledge-type');
  updateTypeFields(type?.value || 'manual');
  type?.addEventListener('change', (event) => updateTypeFields(event.target.value));
  qs('#knowledge-filter')?.addEventListener('change', (event) => {
    state.agentId = event.target.value;
    loadSources();
  });
  qs('#knowledge-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');
    if (!file || (typeof file === 'object' && file.size === 0)) formData.delete('file');
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await api('/knowledge', { method: 'POST', body: formData });
      toast('Knowledge source added', 'success');
      form.reset();
      updateTypeFields('manual');
      await loadSources();
    } catch (error) {
      toast(error?.message || 'Could not add source', 'error');
    } finally {
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = false;
    }
  });
}

async function handleClick(event) {
  const button = event.target.closest('[data-action="delete-source"]');
  if (!button) return;
  if (!confirmAction('Delete this knowledge source?')) return;
  try {
    await api(`/knowledge/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    state.sources = state.sources.filter((source) => source?.id !== button.dataset.id);
    toast('Knowledge source deleted', 'success');
    render();
  } catch (error) {
    toast(error?.message || 'Could not delete source', 'error');
  }
}

async function loadSources() {
  const payload = await api(`/knowledge${buildQuery({ agentId: state.agentId })}`);
  state.sources = asArray(payload, ['sources']);
  render();
}

async function loadPage() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const agentsPayload = await api('/agents');
    state.agents = asArray(agentsPayload, ['agents']);
    await loadSources();
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

initApp({ active: 'knowledge-base' }).then(loadPage).catch(showPageError);
