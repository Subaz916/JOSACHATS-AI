import { api, qs, qsa, escapeHtml, toast, applyTheme, wireThemeToggle } from './core.js';

const params = new URLSearchParams(location.search);
applyTheme(params.get('theme'));
wireThemeToggle();

qs('#mobile-menu')?.addEventListener('click', () => qs('#nav-links')?.classList.toggle('open'));

async function loadPlans() {
  const container = qs('#pricing-grid');
  if (!container) return;
  try {
    const data = await api('/api/plans', { auth: false });
    const plans = data.plans || [];
    container.innerHTML = plans.length ? plans.map((plan) => `
      <article class="card">
        <span class="chip">${escapeHtml(plan.code)}</span>
        <h3>${escapeHtml(plan.name)}</h3>
        <div class="price">PKR ${Number(plan.price_pkr || 0).toLocaleString()}<span class="small muted">/month</span></div>
        <p>${Number(plan.agent_limit || 0)} agents · ${Number(plan.conversation_limit || 0)} conversations/month</p>
        <ul>${(plan.features || []).map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
        <a class="btn primary" href="/login.html?next=/billing.html">Choose ${escapeHtml(plan.name)}</a>
      </article>`).join('') : '<div class="empty-state">No plans are configured yet.</div>';
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><strong>Pricing unavailable</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function voiceDemo() {
  const messages = qs('#demo-messages');
  const form = qs('#demo-form');
  const input = qs('#demo-input');
  const mic = qs('#demo-mic');
  if (!form || !messages) return;
  let token = null;
  const append = (role, text) => {
    const node = document.createElement('div');
    node.className = `bubble ${role === 'user' ? 'user' : 'bot'}`;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  };
  const speak = (text) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
  };
  const send = async (text, channel = 'text') => {
    if (!text.trim()) return;
    append('user', text);
    input.value = '';
    try {
      if (!token) {
        const started = await api(`/api/public/agents/${encodeURIComponent(qs('#demo-slug')?.value || 'shahryar-demo')}/conversations`, { method: 'POST', auth: false, body: { channel } });
        token = started.token || started.conversation?.token;
        if (started.welcomeMessage) append('bot', started.welcomeMessage);
      }
      const result = await api(`/api/public/conversations/${encodeURIComponent(token)}/messages`, { method: 'POST', auth: false, body: { content: text }, headers: { 'x-channel': channel } });
      const reply = typeof result.reply === 'string' ? result.reply : result.message?.content || 'No reply returned.';
      append('bot', reply);
      speak(reply);
    } catch (error) {
      append('bot', `Demo unavailable: ${error.message}`);
    }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (mic) {
    if (!Recognition) { mic.disabled = true; mic.title = 'Speech recognition is unavailable in this browser'; }
    else mic.addEventListener('click', () => {
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.onresult = (event) => send(event.results[0][0].transcript, 'voice');
      recognition.onerror = () => toast('Voice input failed', 'error');
      recognition.start();
    });
  }
  append('bot', 'Ask me about flavors, prices, hours, or delivery.');
}

loadPlans();
voiceDemo();
