import { api, qs, escapeHtml, formatDate, toast, loadConfig } from '../../js/core.js';

const config = await loadConfig();
const params = new URLSearchParams(location.search);
const slug = decodeURIComponent(location.pathname.match(/\/chat\/([^/]+)/)?.[1] || params.get('agent') || '');
const embed = params.get('embed') === '1';
const messagesNode = qs('#chat-messages');
let token = null;
let agent = {};
let settings = {};
let languages = [];
let selectedLanguage = '';
let recognition = null;
let awaitingFeedback = false;

if (embed) qs('#chat-close')?.classList.remove('hidden');
qs('#chat-close')?.addEventListener('click', () => window.parent?.postMessage({ type: 'josachats:close' }, '*'));

function append(role, content, meta = '') {
  const node = document.createElement('div');
  node.className = `chat-message ${role === 'user' ? 'user' : 'bot'}`;
  node.textContent = content;
  if (meta) {
    const span = document.createElement('span');
    span.className = 'chat-meta';
    span.textContent = meta;
    node.appendChild(span);
  }
  messagesNode.appendChild(node);
  messagesNode.scrollTop = messagesNode.scrollHeight;
  return node;
}

function applyBranding() {
  const branding = agent.branding || {};
  const primary = branding.primaryColor || '#6d5efc';
  qs('#chat-title').textContent = agent.agentName || agent.name || 'AI Support';
  qs('#chat-avatar').textContent = (qs('#chat-title').textContent || 'AI').slice(0, 2).toUpperCase();
  qs('#chat-avatar').style.background = `linear-gradient(135deg, ${primary}, ${branding.secondaryColor || '#18b6a4'})`;
  document.documentElement.style.setProperty('--brand', primary);
  if (agent.welcomeMessage && !messagesNode.children.length) append('bot', agent.welcomeMessage);
}

function configureVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = qs('#chat-mic');
  settings = agent.settings || {};
  if (settings.textInput === false) { qs('#chat-input').disabled = true; qs('#chat-send').disabled = true; }
  if (!settings.voiceInput || !Recognition) { mic.disabled = true; mic.title = 'Voice input unavailable'; }
  if (!settings.voiceOutput || !('speechSynthesis' in window)) qs('#voice-status').textContent = 'Voice output unavailable on this device';
  else {
    const voices = speechSynthesis.getVoices();
    const available = voices.filter((voice) => languages.some((language) => voice.lang.toLowerCase().startsWith(language.slice(0, 2))));
    qs('#voice-status').textContent = available.length ? `${available.length} local voice(s) ready` : 'No offline voice for this language; text still works';
  }
  if (Recognition && settings.voiceInput) {
    recognition = new Recognition();
    recognition.onresult = (event) => { const text = event.results[0][0].transcript; qs('#chat-input').value = text; send(text, 'voice'); };
    recognition.onerror = () => toast('Voice input failed', 'error');
    recognition.onend = () => { mic.textContent = 'Mic'; };
  }
  mic?.addEventListener('click', () => {
    if (!recognition) return;
    recognition.lang = selectedLanguage === 'ur' ? 'ur-PK' : selectedLanguage === 'hi' ? 'hi-IN' : selectedLanguage === 'hinglish' ? 'en-IN' : 'en-US';
    recognition.start();
    mic.textContent = 'Listening...';
  });
}

function speak(text) {
  if (settings.voiceOutput === false || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const lang = selectedLanguage === 'ur' ? 'ur-PK' : selectedLanguage === 'hi' ? 'hi-IN' : selectedLanguage === 'hinglish' ? 'en-IN' : 'en-US';
  utterance.lang = lang;
  utterance.rate = Number(agent.voice?.speed || 1);
  const voice = speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

async function start() {
  qs('#chat-status').textContent = 'Connecting...';
  const data = await api(`/api/public/agents/${encodeURIComponent(slug)}/conversations`, { method: 'POST', auth: false, body: { channel: 'text' } });
  token = data.token || data.conversation?.token;
  agent = data.agent || {};
  languages = agent.languages || ['en'];
  selectedLanguage = languages[0] || 'en';
  qs('#chat-language').innerHTML = languages.map((language) => `<option value="${escapeHtml(language)}">${escapeHtml(language)}</option>`).join('');
  applyBranding();
  configureVoice();
  qs('#chat-status').textContent = 'Online · AI support';
}

async function send(content, channel = 'text') {
  if (!content.trim() || !token) return;
  append('user', content, formatDate(new Date().toISOString()));
  qs('#chat-input').value = '';
  const typing = append('bot', 'Typing...');
  typing.classList.add('typing');
  try {
    const data = await api(`/api/public/conversations/${encodeURIComponent(token)}/messages`, {
      method: 'POST', auth: false, body: { content, language: selectedLanguage }, headers: { 'x-channel': channel }
    });
    typing.remove();
    const reply = typeof data.reply === 'string' ? data.reply : data.message?.content || 'No reply returned.';
    const node = append('bot', reply, formatDate(new Date().toISOString()));
    if (data.audioUrl) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = data.audioUrl;
      node.appendChild(audio);
    } else speak(reply);
    awaitingFeedback = settings.feedback !== false;
    renderFeedback();
  } catch (error) {
    typing.remove();
    append('bot', error.status === 403 ? 'Conversation limit reached. Please upgrade your plan to continue.' : `Error: ${error.message}`);
  }
}

function renderFeedback() {
  const root = qs('#chat-feedback');
  if (!awaitingFeedback) { root.innerHTML = ''; return; }
  root.innerHTML = '<span class="small muted">Rate this answer:</span>' + [1, 2, 3, 4, 5].map((n) => `<button class="btn small" data-rating="${n}">${n}★</button>`).join('');
  qsa('[data-rating]', root).forEach((button) => button.addEventListener('click', () => {
    api(`/api/public/conversations/${encodeURIComponent(token)}/feedback`, { method: 'POST', auth: false, body: { rating: Number(button.dataset.rating) } }).catch((error) => toast(error.message, 'error'));
    awaitingFeedback = false; renderFeedback(); toast('Thanks for the feedback', 'success');
  }));
}

qs('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); send(qs('#chat-input').value); });
qs('#chat-language').addEventListener('change', (event) => { selectedLanguage = event.target.value; });
qs('#chat-handoff').addEventListener('click', async () => {
  const name = prompt('Your name');
  const email = prompt('Your email');
  const reason = prompt('How can we help?');
  if (!email) return;
  try { await api(`/api/public/conversations/${encodeURIComponent(token)}/handoff`, { method: 'POST', auth: false, body: { name, email, reason } }); toast('Human support requested', 'success'); }
  catch (error) { toast(error.message, 'error'); }
});

start().catch((error) => {
  append('bot', `Chat unavailable: ${error.message}`);
  qs('#chat-status').textContent = 'Unavailable';
  qs('#chat-input').disabled = true;
  qs('#chat-send').disabled = true;
});
