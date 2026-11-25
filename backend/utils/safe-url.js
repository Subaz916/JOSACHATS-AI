import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateIp(ip) {
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7));
  return false;
}

export async function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs are allowed');
  if (url.username || url.password) throw new Error('URL credentials are not allowed');

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literal = isIP(hostname);
  if (literal && isPrivateIp(hostname)) throw new Error('Private network URLs are not allowed');

  const records = await lookup(hostname, { all: true });
  if (!records.length) throw new Error('URL host does not resolve');
  if (records.some((record) => isPrivateIp(record.address))) throw new Error('Private network URLs are not allowed');
  return url;
}

export async function fetchPublicText(value, { maxBytes = 1_500_000, timeoutMs = 12000 } = {}) {
  let current = new URL(String(value));
  const seen = new Set();
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicUrl(current.toString());
    if (seen.has(current.toString())) throw new Error('Redirect loop detected');
    seen.add(current.toString());
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'JosaChats-KnowledgeBot/1.0', accept: 'text/html,text/plain' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect has no location');
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error('Only HTML and text webpages are supported');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Webpage is too large');
    return { text: buffer.toString('utf8'), finalUrl: current.toString() };
  }
  throw new Error('Too many redirects');
}
