export function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function chunkText(value, size = 1200, overlap = 160) {
  const text = normalizeText(stripHtml(value));
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '), slice.lastIndexOf('? '));
      if (boundary > size * 0.55) end = start + boundary + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

const hinglishWords = /(apko|apka|aap|kya|hai|hain|kaise|kitna|kahan|kyun|nahi|theek|shukriya|order|delivery|price|scoop|flavour|flavor|open|closed|today)/gi;

export function detectLanguage(value) {
  const text = String(value || '');
  if (/[\u0600-\u06FF]/.test(text)) return 'ur';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  const matches = text.match(hinglishWords) || [];
  if (matches.length >= 2) return 'hinglish';
  return 'en';
}

export function voiceLanguage(language) {
  if (language === 'hi' || language === 'hinglish') return 'hi-IN';
  if (language === 'ur') return 'ur-PK';
  return 'en-US';
}

export function safeSnippet(value, length = 220) {
  const text = normalizeText(value);
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

export function tokenize(value) {
  return normalizeText(value).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}
