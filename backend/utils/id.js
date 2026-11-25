import { randomBytes, randomUUID } from 'node:crypto';

export function makeId(prefix = '') {
  return `${prefix}${randomUUID().replace(/-/g, '')}`;
}

export function makeToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function slugify(value, fallback = 'agent') {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || fallback;
}

export function uniqueSlug(value, suffixBytes = 4) {
  return `${slugify(value)}-${randomBytes(suffixBytes).toString('hex')}`;
}
