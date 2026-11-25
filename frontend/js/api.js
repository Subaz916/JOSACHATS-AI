import { authHeaders } from './supabase.js';

function buildUrl(path) {
  const value = String(path || '');
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/api')) return value;
  return `/api${value.startsWith('/') ? value : `/${value}`}`;
}

function readErrorData(response) {
  return response
    .text()
    .then((text) => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return { message: text };
      }
    })
    .catch(() => null);
}

function errorMessage(data, response) {
  if (data?.error?.message) return String(data.error.message);
  if (typeof data?.error === 'string') return data.error;
  if (data?.message) return String(data.message);
  if (data?.detail) return String(data.detail);
  return `Request failed with status ${response.status}`;
}

function buildError(message, response, data) {
  const error = new Error(message);
  error.status = response.status;
  error.details = data;
  return error;
}

export async function api(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    headers = {},
    raw = false,
    redirectOnUnauthorized = false,
    ...rest
  } = options;

  const requestHeaders = new Headers(headers);
  let payload;

  if (body !== undefined && body !== null) {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      payload = body;
    } else {
      requestHeaders.set('Content-Type', 'application/json');
      payload = JSON.stringify(body);
    }
  }

  if (auth) {
    const extraHeaders = await authHeaders();
    for (const [name, value] of Object.entries(extraHeaders)) requestHeaders.set(name, value);
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers: requestHeaders,
    body: payload,
    ...rest
  });

  if (!response.ok) {
    const data = await readErrorData(response);
    if (response.status === 401 && redirectOnUnauthorized && !window.location.pathname.startsWith('/login.html')) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.assign(`/login.html?next=${next}`);
    }
    throw buildError(errorMessage(data, response), response, data);
  }

  if (raw) return response;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
