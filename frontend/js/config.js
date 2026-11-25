let cachedConfig = null;
let pendingConfig = null;

export async function loadConfig() {
  if (cachedConfig) return cachedConfig;
  if (pendingConfig) return pendingConfig;

  pendingConfig = fetch('/api/config', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Config request failed with status ${response.status}`);
      return response.json();
    })
    .then((config) => {
      if (!config || typeof config !== 'object') throw new Error('Invalid configuration response');
      cachedConfig = config;
      return config;
    })
    .catch((error) => {
      pendingConfig = null;
      throw error;
    });

  return pendingConfig;
}

export function getConfig() {
  return cachedConfig;
}
