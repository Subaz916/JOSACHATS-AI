import {
  api, qs, qsa, escapeHtml, formatDate, formatMoney, statusBadge, emptyState, toast,
  setLoading, copyText, downloadText, debounce, currentUser, logout, applyTheme, wireThemeToggle
} from './core.js';

const NAV = [
  ['dashboard.html', 'Overview'], ['agents.html', 'My AI Agents'], ['create-agent.html', 'Create Agent'],
  ['conversations.html', 'Conversations'], ['knowledge-base.html', 'Knowledge Base'],
  ['products.html', 'Products & Services'], ['analytics.html', 'Analytics'],
  ['human-support.html', 'Human Support'], ['integrations.html', 'Integrations'],
  ['billing.html', 'Billing & Subscription'], ['settings.html', 'Settings']
];

const state = { page: document.body.dataset.page || 'dashboard', agents: [], catalogType: 'products' };

function renderShell() {
  const nav = qs('#sidebar-nav');
  if (nav) {
    nav.innerHTML = NAV.map(([href, label]) => `<a href="/${href}" class="${location.pathname.endsWith('/' + href) ? 'active' : ''}">${label}</a>`).join('');
  }
  qs('#logout')?.addEventListener('click', logout);
  applyTheme();
  wireThemeToggle();
  currentUser().then((user) => {
    if (qs('#user-email') && user) qs('#user-email').textContent = user.email || '';
  }).catch(() => null);
  api('/api/notifications', { auth: true }).then((data) => {
    const count = Array.isArray(data.notifications) ? data.notifications.length : 0;
    if (qs('#notification-count')) qs('#notification-count').textContent = `${count} alerts`;
  }).catch(() => null);
}

function showError(view, error) {
  view.innerHTML = `<div class="card"><strong>Could not load this section.</strong><p>${escapeHtml(error.message)}</p></div>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">${emptyState('No records found')}</td></tr>`}</tbody></table></div>`;
}

async function loadAgents() {
  const data = await api('/api/agents');
  state.agents = data.agents || [];
  return state.agents;
}

function agentOptions(selected = '') {
  return state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}" ${agent.id === selected ? 'selected' : ''}>${escapeHtml(agent.name)}</option>`).join('');
}

async function renderDashboard() {
  const view = qs('#dashboard-view');
  try {
    const d = await api('/api/dashboard/overview');
    const quota = d.quota || {};
    const usage = Number(quota.usage || 0);
    const limit = Number(quota.limit || 1) || 1;
    const recent = d.recentConversations || [];
    const performance = d.agentPerformance || [];
    const voice = Number(d.interactions?.voice || 0);
    const text = Number(d.interactions?.text || 0);
    const totalInteractions = Math.max(1, voice + text);
    view.innerHTML = `
      <div class="grid four">
        <div class="card kpi"><span class="muted">Agents</span><span class="value">${Number(d.agents?.active || 0)}/${Number(d.agents?.total || 0)}</span><span class="small muted">active</span></div>
        <div class="card kpi"><span class="muted">Conversations</span><span class="value">${Number(d.conversations?.total || 0)}</span><span class="small muted">${Number(d.conversations?.monthly || 0)} this month</span></div>
        <div class="card kpi"><span class="muted">Current plan</span><span class="value">${escapeHtml(d.plan?.name || 'Free')}</span><span class="small muted">${statusBadge(d.subscription?.status || 'inactive')}</span></div>
        <div class="card kpi"><span class="muted">Quota used</span><span class="value">${usage}/${limit}</span><div class="progress"><span style="width:${Math.min(100, (usage / limit) * 100)}%"></span></div></div>
      </div>
      <div class="grid two" style="margin-top:20px">
        <div class="card"><h3>Interaction channels</h3><div class="bar-row"><span>Voice</span><div class="progress"><span style="width:${(voice / totalInteractions) * 100}%"></span></div><strong>${voice}</strong></div><div class="bar-row"><span>Text</span><div class="progress"><span style="width:${(text / totalInteractions) * 100}%"></span></div><strong>${text}</strong></div></div>
        <div class="card"><h3>Quick actions</h3><div class="row wrap"><a class="btn primary small" href="/create-agent.html">Create Agent</a><a class="btn small" href="/knowledge-base.html">Add Knowledge</a><a class="btn small" href="/integrations.html">Get Widget</a></div></div>
      </div>
      <div class="card" style="margin-top:20px"><h3>Recent conversations</h3>${table(['Customer', 'Agent', 'Channel', 'Status', 'Created'], recent.map((c) => `<tr><td>${escapeHtml(c.customer_identifier || 'Anonymous')}</td><td>${escapeHtml(c.agentName || '—')}</td><td>${escapeHtml(c.channel || 'text')}</td><td>${statusBadge(c.status)}</td><td>${formatDate(c.created_at)}</td></tr>`).join(''))}</div>
      <div class="card" style="margin-top:20px"><h3>Agent performance</h3>${table(['Agent', 'Conversations', 'Satisfaction'], performance.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td>${Number(a.conversations || 0)}</td><td>${a.satisfaction ? Number(a.satisfaction).toFixed(1) : '—'}</td></tr>`).join(''))}</div>`;
  } catch (error) { showError(view, error); }
}

async function renderAgents() {
  const view = qs('#agents-view');
  try {
    const agents = await loadAgents();
    view.innerHTML = table(['Agent', 'Business', 'Status', 'Public link', 'Created', 'Actions'], agents.map((agent) => `<tr>
      <td><strong>${escapeHtml(agent.name)}</strong></td><td>${escapeHtml(agent.businessName || '—')}</td><td>${statusBadge(agent.status)}</td>
      <td>${agent.publicUrl ? `<a class="small" href="${escapeHtml(agent.publicUrl)}" target="_blank" rel="noopener">${escapeHtml(agent.publicUrl)}</a>` : '—'}</td>
      <td>—</td>
      <td class="row"><button class="btn small" data-copy="${escapeHtml(agent.publicUrl || '')}">Copy</button><button class="btn small" data-share="${escapeHtml(agent.id)}">QR</button><button class="btn small" data-publish="${escapeHtml(agent.id)}" data-status="${agent.status === 'active' ? 'inactive' : 'active'}">${agent.status === 'active' ? 'Pause' : 'Publish'}</button><a class="btn small" href="/create-agent.html?edit=${escapeHtml(agent.id)}">Edit</a><button class="btn danger small" data-delete="${escapeHtml(agent.id)}">Delete</button></td></tr>`).join(''));
    qsa('[data-copy]', view).forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copy)));
    qsa('[data-publish]', view).forEach((button) => button.addEventListener('click', async () => {
      try { await api(`/api/agents/${button.dataset.publish}/publish`, { method: 'POST', body: { status: button.dataset.status } }); toast('Agent status updated', 'success'); renderAgents(); }
      catch (error) { toast(error.message, 'error'); }
    }));
    qsa('[data-share]', view).forEach((button) => button.addEventListener('click', async () => {
      try {
        const data = await api(`/api/agents/${button.dataset.share}/share`);
        const root = qs('#modal-root');
        root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>Share agent</h3>${data.qrDataUrl ? `<img src="${data.qrDataUrl}" alt="QR code" style="max-width:220px">` : ''}<p>${escapeHtml(data.publicUrl || '')}</p><button class="btn" id="close-modal">Close</button></div></div>`;
        qs('#close-modal', root).onclick = () => { root.innerHTML = ''; };
      } catch (error) { toast(error.message, 'error'); }
    }));
    qsa('[data-delete]', view).forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Delete this agent and its knowledge?')) return;
      try { await api(`/api/agents/${button.dataset.delete}`, { method: 'DELETE' }); toast('Agent deleted', 'success'); renderAgents(); }
      catch (error) { toast(error.message, 'error'); }
    }));
  } catch (error) { showError(view, error); }
}

const WIZARD_STEPS = ['Basic Information', 'Business Instructions', 'Knowledge Base', 'Language and Voice', 'Branding', 'Advanced Settings', 'Preview and Test', 'Create Agent'];

function wizardHtml() {
  return `<div class="wizard-steps">${WIZARD_STEPS.map((step, index) => `<button type="button" data-step="${index}" class="${index === 0 ? 'active' : ''}">${index + 1}. ${step}</button>`).join('')}</div>
  <form id="wizard-form" class="card stack">
    <section class="wizard-step active" data-step="0"><h2>Basic Information</h2><div class="grid two"><label>Agent name<input name="name" required></label><label>Business name<input name="businessName" required></label><label>Category<input name="businessCategory" required placeholder="Restaurant, Clinic, Salon..."></label><label>Business email<input name="businessEmail" type="email" required></label><label>Phone<input name="businessPhone"></label><label>Website<input name="websiteUrl" type="url" placeholder="https://..."></label></div><label>Business address<input name="businessAddress"></label><label>Description<textarea name="businessDescription" required minlength="10">Tell us what your business does, what customers ask, and how you operate.</textarea></label></section>
    <section class="wizard-step" data-step="1"><h2>Business Instructions</h2><div class="grid two"><label>Personality<input name="personality" value="Warm, concise, professional"></label><label>Style<input name="style" value="Friendly and clear"></label><label>Response length<select name="responseLength"><option value="short">Short</option><option value="medium" selected>Medium</option><option value="detailed">Detailed</option></select></label><label>Escalation<input name="escalation" value="Offer human support when unsure"></label></div><label>Rules (one per line)<textarea name="rules">Answer only from business knowledge.
Never invent prices or policies.</textarea></label><label>Policies (one per line)<textarea name="policies"></textarea></label><label>Allowed topics<textarea name="topicsAllow"></textarea></label><label>Avoid topics<textarea name="topicsAvoid"></textarea></label><label>Custom instructions<textarea name="custom"></textarea></label><label>Example Q&A (Question | Answer, one per line)<textarea name="examples">What are your hours? | We are open daily from 12 PM to 11 PM.</textarea></label></section>
    <section class="wizard-step" data-step="2"><h2>Knowledge Base</h2><label>Business manual / policies<textarea name="manualText" rows="5"></textarea></label><div id="faq-list"></div><button class="btn small" id="add-faq" type="button">Add FAQ</button><label>Website URLs (one per line)<textarea name="urls"></textarea></label><div class="grid two"><label>Products text<textarea name="productText"></textarea></label><label>Services text<textarea name="serviceText"></textarea></label><label>Pricing text<textarea name="pricingText"></textarea></label><label>Terms text<textarea name="termsText"></textarea></label></div><label>Knowledge files (PDF, DOCX, TXT, MD, CSV; max 10)<input name="knowledgeFiles" type="file" multiple accept=".pdf,.docx,.txt,.md,.csv"></label></section>
    <section class="wizard-step" data-step="3"><h2>Language and Voice</h2><div class="grid two"><label><span class="check"><input type="checkbox" name="lang" value="en" checked> English</span></label><label><span class="check"><input type="checkbox" name="lang" value="ur"> Urdu</span></label><label><span class="check"><input type="checkbox" name="lang" value="hi"> Hindi</span></label><label><span class="check"><input type="checkbox" name="lang" value="hinglish"> Hinglish</span></label></div><div class="grid two"><label>Voice provider<select name="voiceProvider"><option value="browser">Browser / local voice</option><option value="proxy">Server voice proxy</option></select></label><label>Voice style<input name="voiceStyle" value="Natural"></label><label>Speech speed<input name="voiceSpeed" type="number" min="0.5" max="2" step="0.1" value="1"></label><label>Response mode<select name="responseMode"><option value="balanced">Balanced</option><option value="voice-first">Voice first</option><option value="text-first">Text first</option></select></label><label>Voice name<input name="voiceName" placeholder="Optional device voice name"></label></div></section>
    <section class="wizard-step" data-step="4"><h2>Branding</h2><div class="grid two"><label>Display name<input name="displayName"></label><label>Theme<select name="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto</option></select></label><label>Primary color<input name="primaryColor" type="color" value="#6d5efc"></label><label>Secondary color<input name="secondaryColor" type="color" value="#18b6a4"></label><label>Logo<input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp"></label></div><label>Welcome message<textarea name="welcomeMessage">Assalam-o-Alaikum! How can I help today?</textarea></label><label>Chat background URL<input name="chatBackground"></label></section>
    <section class="wizard-step" data-step="5"><h2>Advanced Settings</h2><div class="grid two"><label><span class="check"><input type="checkbox" name="voiceInput" checked> Voice input</span></label><label><span class="check"><input type="checkbox" name="voiceOutput" checked> Voice output</span></label><label><span class="check"><input type="checkbox" name="textInput" checked> Text input</span></label><label><span class="check"><input type="checkbox" name="textResponses" checked> Text responses</span></label><label><span class="check"><input type="checkbox" name="humanSupport"> Human support</span></label><label><span class="check"><input type="checkbox" name="feedback" checked> Feedback</span></label><label>Max response length<input name="maxResponseLength" type="number" min="100" max="6000" value="1200"></label><label>Conversation limit<input name="conversationLimit" type="number" min="1" max="500" value="50"></label></div><label>Opening hours<input name="openingHours" value="Mon-Sun, 9 AM to 9 PM"></label></section>
    <section class="wizard-step" data-step="6"><h2>Preview and Test</h2><div class="preview-frame" id="agent-preview"></div><p class="small muted">Preview reflects branding and identity. Live testing happens after creation.</p></section>
    <section class="wizard-step" data-step="7"><h2>Create Agent</h2><div class="card"><h3>Ready to create</h3><p>Your agent will be saved to your workspace. Knowledge ingestion may take a moment.</p><label class="check"><input type="checkbox" name="publish"> Publish immediately</label></div><p id="wizard-error" style="color:var(--danger)"></p><button class="btn primary" type="submit">Create AI Agent</button></section>
    <div class="row between" style="margin-top:10px"><button class="btn" type="button" id="wizard-prev">Previous</button><button class="btn primary" type="button" id="wizard-next">Next</button></div>
  </form>`;
}

function wizardPayload(form) {
  const value = (name) => form.elements[name]?.value?.trim() || '';
  const checked = (name) => qsa(`input[name="${name}"]:checked`, form).map((input) => input.value);
  const flag = (name) => Boolean(form.elements[name]?.checked);
  const lines = (name) => value(name).split('\n').map((line) => line.trim()).filter(Boolean);
  const faqs = [];
  qsa('.faq-row', form).forEach((row) => {
    const question = qs('[data-question]', row)?.value.trim();
    const answer = qs('[data-answer]', row)?.value.trim();
    if (question && answer) faqs.push({ question, answer });
  });
  return {
    name: value('name'), businessName: value('businessName'), businessCategory: value('businessCategory'),
    businessDescription: value('businessDescription'), businessEmail: value('businessEmail'), businessPhone: value('businessPhone'),
    businessAddress: value('businessAddress'), websiteUrl: value('websiteUrl'),
    instructions: {
      personality: value('personality'), style: value('style'), responseLength: value('responseLength') || 'medium',
      rules: value('rules'), policies: value('policies'), topicsAllow: value('topicsAllow'), topicsAvoid: value('topicsAvoid'),
      escalation: value('escalation'), examples: value('examples'), custom: value('custom')
    },
    languages: checked('lang').length ? checked('lang') : ['en'],
    voice: { provider: value('voiceProvider'), style: value('voiceStyle'), speed: Number(value('voiceSpeed') || 1), responseMode: value('responseMode'), voiceName: value('voiceName') },
    branding: { displayName: value('displayName') || value('name'), primaryColor: value('primaryColor'), secondaryColor: value('secondaryColor'), welcomeMessage: value('welcomeMessage'), chatBackground: value('chatBackground'), theme: value('theme') },
    settings: { voiceInput: flag('voiceInput'), voiceOutput: flag('voiceOutput'), textInput: flag('textInput'), textResponses: flag('textResponses'), humanSupport: flag('humanSupport'), feedback: flag('feedback'), maxResponseLength: Number(value('maxResponseLength') || 1200), conversationLimit: Number(value('conversationLimit') || 50), openingHours: value('openingHours') },
    knowledge: { manualText: value('manualText'), faqs, urls: lines('urls'), productText: value('productText'), serviceText: value('serviceText'), pricingText: value('pricingText'), termsText: value('termsText') },
    publish: flag('publish')
  };
}

function renderWizard() {
  const view = qs('#wizard-view');
  const editId = new URLSearchParams(location.search).get('edit');
  view.innerHTML = wizardHtml();
  const form = qs('#wizard-form');
  let current = 0;
  const show = (index) => {
    current = Math.max(0, Math.min(WIZARD_STEPS.length - 1, index));
    qsa('.wizard-step', form).forEach((section, i) => section.classList.toggle('active', i === current));
    qsa('.wizard-steps button', form).forEach((button, i) => button.classList.toggle('active', i === current));
    if (current === 6) {
      const payload = wizardPayload(form);
      qs('#agent-preview').innerHTML = `<div class="mock-chat" style="margin:0"><div class="mock-head"><div class="mock-avatar" style="background:linear-gradient(135deg,${escapeHtml(payload.branding.primaryColor)},${escapeHtml(payload.branding.secondaryColor)})"></div><div><strong>${escapeHtml(payload.branding.displayName)}</strong><div class="small muted">${escapeHtml(payload.languages.join(', '))}</div></div></div><div class="mock-body"><div class="bubble bot">${escapeHtml(payload.branding.welcomeMessage)}</div></div></div>`;
    }
  };
  qsa('.wizard-steps button', form).forEach((button) => button.addEventListener('click', () => show(Number(button.dataset.step))));
  qs('#wizard-prev', form).onclick = () => show(current - 1);
  qs('#wizard-next', form).onclick = () => show(current + 1);
  qs('#add-faq', form).onclick = () => {
    const row = document.createElement('div');
    row.className = 'row faq-row';
    row.innerHTML = '<input data-question placeholder="Question"><input data-answer placeholder="Answer">';
    qs('#faq-list', form).appendChild(row);
  };
  if (editId) loadAgentIntoWizard(editId, form, show);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const errorBox = qs('#wizard-error', form);
    errorBox.textContent = '';
    const payload = wizardPayload(form);
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    const logo = form.elements.logoFile?.files?.[0];
    if (logo) formData.append('logoFile', logo);
    qsa('input[name="knowledgeFiles"]', form).forEach((input) => [...input.files].forEach((file) => formData.append('knowledgeFiles', file)));
    try {
      setLoading(button, true, 'Creating...');
      const data = await api('/api/agents', { method: 'POST', body: formData });
      view.innerHTML = `<div class="card center"><h2>Agent created</h2><p>${escapeHtml(data.agent?.name || '')} is ready.</p>${data.qrDataUrl ? `<img src="${data.qrDataUrl}" alt="QR code" style="max-width:220px;margin:auto">` : ''}<div class="row wrap" style="justify-content:center"><a class="btn primary" href="${escapeHtml(data.publicUrl || '#')}" target="_blank" rel="noopener">Open chat</a><button class="btn" id="copy-public">Copy link</button><a class="btn" href="/agents.html">View agents</a></div>${(data.warnings || []).length ? `<p class="small">${data.warnings.length} knowledge source(s) failed to ingest.</p>` : ''}</div>`;
      qs('#copy-public')?.addEventListener('click', () => copyText(data.publicUrl));
    } catch (error) {
      errorBox.textContent = error.message;
      setLoading(button, false);
    }
  });
}

async function loadAgentIntoWizard(id, form, show) {
  try {
    const { agent } = await api(`/api/agents/${id}`);
    const values = {
      name: agent.name, businessName: agent.business_name, businessCategory: agent.business_category,
      businessDescription: agent.business_description, businessEmail: agent.business_email,
      businessPhone: agent.business_phone, businessAddress: agent.business_address, websiteUrl: agent.website_url
    };
    Object.entries(values).forEach(([key, value]) => { if (form.elements[key] && value) form.elements[key].value = value; });
    Object.entries(agent.instructions || {}).forEach(([key, value]) => { if (form.elements[key] && value) form.elements[key].value = value; });
    Object.entries(agent.branding || {}).forEach(([key, value]) => { if (form.elements[key] && value) form.elements[key].value = value; });
    Object.entries(agent.settings || {}).forEach(([key, value]) => { if (form.elements[key] && typeof value === 'boolean') form.elements[key].checked = value; });
    (agent.languages || []).forEach((language) => { const input = form.querySelector(`input[name="lang"][value="${language}"]`); if (input) input.checked = true; });
    show(0);
  } catch (error) { toast(error.message, 'error'); }
}

async function renderConversations() {
  const view = qs('#conversations-view');
  const search = qs('#conversation-search');
  const status = qs('#conversation-status');
  try {
    const data = await api('/api/conversations');
    let rows = data.conversations || data || [];
    const filter = () => {
      const term = (search.value || '').toLowerCase();
      const filtered = rows.filter((c) => (!status.value || c.status === status.value) && (!term || JSON.stringify(c).toLowerCase().includes(term)));
      view.innerHTML = table(['Customer', 'Agent', 'Channel', 'Language', 'Status', 'Created', 'Actions'], filtered.map((c) => `<tr><td>${escapeHtml(c.customer_identifier || 'Anonymous')}</td><td>${escapeHtml(c.agents?.name || '—')}</td><td>${escapeHtml(c.channel || 'text')}</td><td>${escapeHtml(c.language || '—')}</td><td>${statusBadge(c.status)}</td><td>${formatDate(c.created_at)}</td><td><button class="btn small" data-transcript="${escapeHtml(c.id)}">View</button></td></tr>`).join(''));
      qsa('[data-transcript]', view).forEach((button) => button.addEventListener('click', async () => {
        try {
          const detail = await api(`/api/conversations/${button.dataset.transcript}`);
          const root = qs('#modal-root');
          const messages = detail.messages || [];
          root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>Transcript</h3><div class="chat-messages">${messages.map((m) => `<div class="chat-message ${m.role === 'user' ? 'user' : 'bot'}">${escapeHtml(m.content)}<span class="chat-meta">${formatDate(m.created_at)}</span></div>`).join('') || emptyState('No messages yet')}</div><div class="row"><button class="btn primary small" id="export-transcript">Export CSV</button><button class="btn" id="close-modal">Close</button></div></div></div>`;
          qs('#close-modal', root).onclick = () => { root.innerHTML = ''; };
          qs('#export-transcript', root).onclick = async () => {
            try {
              const response = await api(`/api/conversations/${button.dataset.transcript}/export?format=csv`, { raw: true });
              downloadText(`conversation-${button.dataset.transcript}.csv`, await response.text(), 'text/csv');
            } catch (error) { toast(error.message, 'error'); }
          };
        } catch (error) { toast(error.message, 'error'); }
      }));
    };
    search.addEventListener('input', debounce(filter, 200));
    status.addEventListener('change', filter);
    filter();
  } catch (error) { showError(view, error); }
}

async function renderKnowledge() {
  const view = qs('#knowledge-view');
  await loadAgents();
  const select = qs('#knowledge-agent-select');
  const filter = qs('#knowledge-agent-filter');
  const options = agentOptions();
  if (select) select.innerHTML = options;
  if (filter) filter.innerHTML = `<option value="">All agents</option>${options}`;
  const load = async () => {
    try {
      const data = await api(`/api/knowledge${filter.value ? `?agentId=${filter.value}` : ''}`);
      const sources = data.sources || [];
      view.innerHTML = `<h3>Sources</h3>${table(['Title', 'Type', 'Status', 'Chunks', 'Created', 'Actions'], sources.map((s) => `<tr><td>${escapeHtml(s.title)}</td><td>${escapeHtml(s.type)}</td><td>${statusBadge(s.status)}</td><td>${Number(s.chunk_count || 0)}</td><td>${formatDate(s.created_at, false)}</td><td><button class="btn danger small" data-delete="${escapeHtml(s.id)}">Delete</button></td></tr>`).join(''))}`;
      qsa('[data-delete]', view).forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Delete this source?')) return;
        try { await api(`/api/knowledge/${button.dataset.delete}`, { method: 'DELETE' }); toast('Source deleted', 'success'); load(); }
        catch (error) { toast(error.message, 'error'); }
      }));
    } catch (error) { showError(view, error); }
  };
  filter.addEventListener('change', load);
  qs('#knowledge-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    try { setLoading(button, true, 'Adding...'); await api('/api/knowledge', { method: 'POST', body: data }); form.reset(); toast('Knowledge source added', 'success'); load(); }
    catch (error) { toast(error.message, 'error'); }
    finally { setLoading(button, false); }
  });
  load();
}

async function renderCatalog() {
  const view = qs('#catalog-view');
  await loadAgents();
  const load = async () => {
    try {
      const data = await api(`/api/${state.catalogType}`);
      const items = data[state.catalogType] || [];
      view.innerHTML = table(['Name', 'Category', 'Price', 'Available', 'Agent', 'Actions'], items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category || '—')}</td><td>${formatMoney(item.price_pkr)}</td><td>${statusBadge(item.available ? 'active' : 'inactive')}</td><td>${escapeHtml(item.agent_name || 'Global')}</td><td><button class="btn small" data-edit='${escapeHtml(JSON.stringify(item))}'>Edit</button><button class="btn danger small" data-delete="${escapeHtml(item.id)}">Delete</button></td></tr>`).join(''));
      qsa('[data-delete]', view).forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Delete this item?')) return;
        try { await api(`/api/${state.catalogType}/${button.dataset.delete}`, { method: 'DELETE' }); load(); }
        catch (error) { toast(error.message, 'error'); }
      }));
      qsa('[data-edit]', view).forEach((button) => button.addEventListener('click', () => openCatalogModal(JSON.parse(button.dataset.edit))));
    } catch (error) { showError(view, error); }
  };
  function openCatalogModal(item = {}) {
    const root = qs('#modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>${item.id ? 'Edit' : 'Add'} ${state.catalogType === 'products' ? 'product' : 'service'}</h3><form class="stack" id="catalog-form"><label>Name<input name="name" value="${escapeHtml(item.name || '')}" required></label><label>Description<textarea name="description">${escapeHtml(item.description || '')}</textarea></label><div class="grid two"><label>Price PKR<input name="pricePkr" type="number" min="0" step="1" value="${Number(item.price_pkr || 0)}"></label><label>Category<input name="category" value="${escapeHtml(item.category || '')}"></label><label>Agent<select name="agentId"><option value="">Global</option>${agentOptions(item.agent_id)}</select></label><label class="check"><input type="checkbox" name="available" ${item.available !== false ? 'checked' : ''}> Available</label></div><div class="row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="close-modal">Cancel</button></div></form></div></div>`;
    qs('#close-modal', root).onclick = () => { root.innerHTML = ''; };
    qs('#catalog-form', root).onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      body.pricePkr = Number(body.pricePkr || 0);
      body.available = form.elements.available.checked;
      try {
        await api(item.id ? `/api/${state.catalogType}/${item.id}` : `/api/${state.catalogType}`, { method: item.id ? 'PATCH' : 'POST', body });
        root.innerHTML = ''; toast('Saved', 'success'); load();
      } catch (error) { toast(error.message, 'error'); }
    };
  }
  qsa('[data-catalog]').forEach((button) => button.addEventListener('click', () => {
    state.catalogType = button.dataset.catalog;
    qsa('[data-catalog]').forEach((b) => b.classList.toggle('active', b === button));
    load();
  }));
  qs('#add-catalog').addEventListener('click', () => openCatalogModal());
  load();
}

function bars(rows, labelKey, valueKey) {
  const list = Array.isArray(rows)
    ? rows
    : Object.entries(rows || {}).map(([label, count]) => ({ [labelKey]: label, [valueKey]: count }));
  const max = Math.max(1, ...list.map((row) => Number(row[valueKey] || 0)));
  return list.map((row) => `<div class="bar-row"><span>${escapeHtml(row[labelKey] || 'Unknown')}</span><div class="progress"><span style="width:${(Number(row[valueKey] || 0) / max) * 100}%"></span></div><strong>${Number(row[valueKey] || 0)}</strong></div>`).join('') || emptyState('No data');
}

async function renderAnalytics() {
  const view = qs('#analytics-view');
  const from = qs('#analytics-from');
  const to = qs('#analytics-to');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  from.value = monthAgo; to.value = today;
  const load = async () => {
    try {
      const d = await api(`/api/analytics?from=${from.value}&to=${to.value}`);
      view.innerHTML = `<div class="grid four"><div class="card kpi"><span class="muted">Conversations</span><span class="value">${Number(d.totalConversations || 0)}</span></div><div class="card kpi"><span class="muted">Satisfaction</span><span class="value">${d.satisfaction?.average ? Number(d.satisfaction.average).toFixed(1) : '—'}</span></div><div class="card kpi"><span class="muted">Unanswered</span><span class="value">${Number(d.unansweredQuestions || 0)}</span></div><div class="card kpi"><span class="muted">Agent usage</span><span class="value">${Array.isArray(d.agentUsage) ? d.agentUsage.length : 0}</span></div></div>
        <div class="grid two" style="margin-top:20px"><div class="card"><h3>Daily conversations</h3>${bars(d.dailyConversations || [], 'date', 'count')}</div><div class="card"><h3>Languages</h3>${bars(d.languageDistribution || [], 'language', 'count')}</div><div class="card"><h3>Channels</h3>${bars(d.channelDistribution || [], 'channel', 'count')}</div><div class="card"><h3>Top questions</h3>${bars(d.topQuestions || [], 'question', 'count')}</div></div>`;
    } catch (error) { showError(view, error); }
  };
  from.addEventListener('change', load); to.addEventListener('change', load);
  load();
}

async function renderHumanSupport() {
  const view = qs('#human-support-view');
  try {
    const data = await api('/api/human-support');
    const rows = data.requests || data || [];
    view.innerHTML = table(['Customer', 'Agent', 'Reason', 'Status', 'Created', 'Actions'], rows.map((r) => `<tr><td>${escapeHtml(r.customer_name || r.customer_email || 'Anonymous')}</td><td>${escapeHtml(r.agent_name || '—')}</td><td>${escapeHtml(r.reason || 'Human help requested')}</td><td>${statusBadge(r.status)}</td><td>${formatDate(r.created_at)}</td><td><button class="btn small" data-request='${escapeHtml(JSON.stringify(r))}'>Manage</button></td></tr>`).join(''));
    qsa('[data-request]', view).forEach((button) => button.addEventListener('click', () => {
      const request = JSON.parse(button.dataset.request);
      const root = qs('#modal-root') || document.body;
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.innerHTML = `<div class="modal"><h3>Human support request</h3><p>${escapeHtml(request.reason || '')}</p><form class="stack" id="support-form"><label>Status<select name="status"><option>open</option><option>assigned</option><option>resolved</option></select></label><label>Notes<textarea name="notes">${escapeHtml(request.notes || '')}</textarea></label><div class="row"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="close-modal">Close</button></div></form></div>`;
      document.body.appendChild(modal);
      qs('#close-modal', modal).onclick = () => modal.remove();
      qs('#support-form', modal).onsubmit = async (event) => {
        event.preventDefault();
        try { await api(`/api/human-support/${request.id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(event.currentTarget)) }); modal.remove(); toast('Request updated', 'success'); renderHumanSupport(); }
        catch (error) { toast(error.message, 'error'); }
      };
    }));
  } catch (error) { showError(view, error); }
}

async function renderIntegrations() {
  const view = qs('#integrations-view');
  try {
    const agents = await loadAgents();
    view.innerHTML = `<div class="card stack"><h3>Website widget</h3><label>Choose agent<select id="widget-agent">${agentOptions()}</select></label><label>Embed code<textarea id="embed-code" rows="3" readonly></textarea></label><div class="row"><button class="btn" id="copy-embed">Copy code</button><button class="btn primary" id="preview-widget">Preview</button></div><div id="widget-preview"></div></div><div class="card" style="margin-top:20px"><h3>API integrations</h3>${table(['Type', 'Provider', 'Status'], (agents || []).map((a) => ({ name: a.name, type: 'Agent API', status: a.status })).map((row) => `<tr><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.name)}</td><td>${statusBadge(row.status)}</td></tr>`).join(''))}</div>`;
    const update = () => {
      const id = qs('#widget-agent').value;
      const base = location.origin;
      qs('#embed-code').value = `<script src="${base}/widget/widget.js?agent=${id}" data-agent-id="${id}" data-color="#6d5efc" async></script>`;
    };
    qs('#widget-agent').addEventListener('change', update); update();
    qs('#copy-embed').onclick = () => copyText(qs('#embed-code').value);
    qs('#preview-widget').onclick = () => {
      const agent = agents.find((a) => a.id === qs('#widget-agent').value);
      qs('#widget-preview').innerHTML = agent?.public_url ? `<iframe src="${escapeHtml(agent.public_url)}?embed=1" style="width:100%;height:520px;border:1px solid var(--line);border-radius:16px"></iframe>` : emptyState('Publish the agent first');
    };
  } catch (error) { showError(view, error); }
}

async function renderBilling() {
  const view = qs('#billing-view');
  const notice = qs('#billing-notice');
  const params = new URLSearchParams(location.search);
  if (params.get('success') || params.get('payment') === 'success') {
    try {
      const tracker = params.get('tracker');
      if (tracker) await api(`/api/billing/success?tracker=${encodeURIComponent(tracker)}`);
      notice.innerHTML = '<div class="card">Payment submitted. Subscription status will update after webhook verification.</div>';
    } catch (error) { notice.innerHTML = `<div class="card">${escapeHtml(error.message)}</div>`; }
  }
  if (params.get('canceled') || params.get('cancel') || params.get('payment') === 'cancelled') notice.innerHTML = '<div class="card">Checkout was canceled. No charge was made.</div>';
  try {
    const [plans, subscription, payments] = await Promise.all([api('/api/plans', { auth: false }), api('/api/billing/subscription'), api('/api/billing/payments')]);
    const plan = subscription.plan || {};
    view.innerHTML = `<div class="card"><h3>Current subscription</h3><p>${escapeHtml(plan.name || 'Free plan')} · ${statusBadge(subscription.subscription?.status || 'inactive')}</p><div class="progress"><span style="width:${Math.min(100, ((Number(subscription.usage || 0) / Math.max(1, Number(subscription.quota?.limit || 1))) * 100))}%"></span></div><p class="small">${Number(subscription.usage || 0)} / ${Number(subscription.quota?.limit || 0)} conversations used</p></div>
      <h3 style="margin-top:24px">Plans</h3><div class="grid three">${(plans.plans || []).map((p) => `<div class="card"><h3>${escapeHtml(p.name)}</h3><div class="price">${formatMoney(p.price_pkr)}</div><p>${Number(p.agent_limit || 0)} agents · ${Number(p.conversation_limit || 0)} conversations</p><button class="btn primary" data-checkout="${escapeHtml(p.code)}">Choose plan</button></div>`).join('')}</div>
      <h3 style="margin-top:24px">Payment history</h3>${table(['Tracker', 'Amount', 'Status', 'Created'], (payments.payments || []).map((p) => `<tr><td>${escapeHtml(p.tracker || '—')}</td><td>${formatMoney(p.amount_pkr)}</td><td>${statusBadge(p.status)}</td><td>${formatDate(p.created_at)}</td></tr>`).join(''))}`;
    qsa('[data-checkout]', view).forEach((button) => button.addEventListener('click', async () => {
      try { setLoading(button, true, 'Opening Safepay...'); const data = await api('/api/billing/checkout', { method: 'POST', body: { planCode: button.dataset.checkout } }); location.href = data.checkoutUrl; }
      catch (error) { toast(error.message, 'error'); setLoading(button, false); }
    }));
  } catch (error) { showError(view, error); }
}

async function renderSettings() {
  const view = qs('#settings-view');
  try {
    const data = await api('/api/settings');
    const workspace = data.workspace || {};
    const profile = data.profile || {};
    const settings = data.settings || {};
    const prefs = data.notificationPreferences || {};
    view.innerHTML = `<form class="card stack" id="settings-form"><div class="grid two"><label>Full name<input name="fullName" value="${escapeHtml(profile.full_name || '')}"></label><label>Avatar URL<input name="avatarUrl" value="${escapeHtml(profile.avatar_url || '')}"></label><label>Product name<input name="productName" value="${escapeHtml(settings.productName || '')}"></label><label>Retention days<input name="retentionDays" type="number" min="1" max="3650" value="${Number(settings.retention_days || 365)}"></label></div><label>Workspace: ${escapeHtml(workspace.name || '—')}</label><h3>Notifications</h3><div class="grid two"><label class="check"><input type="checkbox" name="newConversation" ${prefs.new_conversation ? 'checked' : ''}> New conversation</label><label class="check"><input type="checkbox" name="humanSupport" ${prefs.human_support ? 'checked' : ''}> Human support</label><label class="check"><input type="checkbox" name="payment" ${prefs.payment ? 'checked' : ''}> Payments</label></div><label class="check"><input type="checkbox" name="maintenanceMode" ${settings.maintenance_mode ? 'checked' : ''}> Maintenance mode</label><button class="btn primary" type="submit">Save settings</button></form>`;
    qs('#settings-form', view).onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      body.retentionDays = Number(body.retentionDays || 365);
      body.maintenanceMode = form.elements.maintenanceMode.checked;
      body.notificationPreferences = { newConversation: form.elements.newConversation.checked, humanSupport: form.elements.humanSupport.checked, payment: form.elements.payment.checked };
      try { await api('/api/settings', { method: 'PATCH', body }); toast('Settings saved', 'success'); }
      catch (error) { toast(error.message, 'error'); }
    };
  } catch (error) { showError(view, error); }
}

async function init() {
  const { requireSession, getConfig } = await import('./core.js');
  const session = await requireSession();
  if (!session) return;
  renderShell();
  try {
    const config = await getConfig() || await import('./core.js').then((m) => m.loadConfig());
    if (qs('#product-name') && config.productName) qs('#product-name').textContent = config.productName;
  } catch { toast('Configuration unavailable', 'error'); }
  const pages = {
    dashboard: renderDashboard, agents: renderAgents, 'create-agent': renderWizard, conversations: renderConversations,
    knowledge: renderKnowledge, catalog: renderCatalog, analytics: renderAnalytics,
    'human-support': renderHumanSupport, integrations: renderIntegrations, billing: renderBilling, settings: renderSettings
  };
  await pages[state.page]?.();
}

init();
