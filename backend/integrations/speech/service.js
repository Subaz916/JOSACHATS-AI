import { env, capabilities } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';
import { voiceLanguage } from '../../utils/text.js';

export async function synthesizeSpeech({ text, language = 'en', voice = null }) {
  if (!capabilities.ttsProxy) return null;
  const response = await fetch(`${env.ttsApiUrl.replace(/\/$/, '')}/synthesize`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.ttsApiKey}`
    },
    body: JSON.stringify({ text, language: voiceLanguage(language), voice })
  });
  if (!response.ok) throw new HttpError(502, `TTS provider returned HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || 'audio/mpeg');
  if (!contentType.startsWith('audio/')) throw new HttpError(502, 'TTS provider did not return audio');
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}

export async function transcribeAudio({ buffer, filename, language }) {
  if (!capabilities.sttProxy) return null;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/webm' }), filename || 'voice.webm');
  if (language) form.append('language', language);
  const response = await fetch(`${env.sttApiUrl.replace(/\/$/, '')}/transcribe`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${env.sttApiKey}` },
    body: form
  });
  if (!response.ok) throw new HttpError(502, `STT provider returned HTTP ${response.status}`);
  const body = await response.json().catch(() => ({}));
  return String(body.text || body.transcript || '').trim() || null;
}
