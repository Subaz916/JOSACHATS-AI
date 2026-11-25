import { initApp, showPageError, qs, safeSetLoading, panel, present, toast, h } from './app.js';
import { api } from './api.js';

const state = { workspace: {}, profile: {}, settings: {}, notificationPreferences: {} };
const preferenceKeys = ['email', 'inApp', 'newConversation', 'humanSupport', 'payment'];

function preferenceValue(key) {
  const value = state.notificationPreferences?.[key];
  return value !== false;
}

function render() {
  const root = qs('#page-content');
  root.innerHTML = `
    <form id="settings-form">
      <div class="two-column">
        ${panel('Profile', `
          <div class="form-grid">
            <div class="field full"><label for="settings-full-name">Full name</label><input id="settings-full-name" name="fullName" minlength="2" maxlength="120" value="${h(state.profile?.full_name || state.profile?.fullName || '')}"></div>
            <div class="field full"><label for="settings-email">Email</label><input id="settings-email" value="${h(state.profile?.email || '')}" readonly></div>
            <div class="field full"><label for="settings-avatar">Avatar URL</label><input id="settings-avatar" name="avatarUrl" maxlength="500" value="${h(state.profile?.avatar_url || state.profile?.avatarUrl || '')}" placeholder="https://example.com/avatar.png"></div>
          </div>
        `, 'Your account identity')}
        ${panel('Workspace', `
          <div class="form-grid">
            <div class="field"><label>Workspace name</label><input value="${h(state.workspace?.name || '')}" readonly></div>
            <div class="field"><label>Workspace slug</label><input value="${h(state.workspace?.slug || '')}" readonly></div>
            <div class="field full"><label for="settings-product-name">Product name</label><input id="settings-product-name" name="productName" minlength="2" maxlength="120" value="${h(state.settings?.productName || '')}"></div>
            <div class="field"><label for="settings-retention">Retention days</label><input id="settings-retention" name="retentionDays" type="number" min="1" max="3650" value="${h(state.settings?.retentionDays || 30)}"></div>
            <label class="checkbox-row"><input type="checkbox" name="maintenanceMode"${state.settings?.maintenanceMode ? ' checked' : ''}> Maintenance mode</label>
          </div>
        `, 'Branding and data retention')}
      </div>
      ${panel('Notification preferences', `
        <div class="form-grid">
          ${preferenceKeys.map((key) => `<label class="checkbox-row"><input type="checkbox" name="notification.${key}"${preferenceValue(key) ? ' checked' : ''}> ${present(key === 'inApp' ? 'In-app' : key.replace(/([A-Z])/g, ' $1'))}</label>`).join('')}
        </div>
      `, 'Choose which events reach you')}
      <div class="panel"><div class="cell-actions"><button type="submit" class="button primary">Save settings</button><button type="reset" class="button">Reset</button></div></div>
    </form>
  `;
  qs('#settings-form')?.addEventListener('reset', () => window.setTimeout(render, 0));
  qs('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const notificationPreferences = { ...(state.notificationPreferences || {}) };
    preferenceKeys.forEach((key) => {
      notificationPreferences[key] = formData.get(`notification.${key}`) === 'on';
    });
    const payload = {
      fullName: String(formData.get('fullName') || '').trim(),
      avatarUrl: String(formData.get('avatarUrl') || '').trim(),
      productName: String(formData.get('productName') || '').trim(),
      maintenanceMode: formData.get('maintenanceMode') === 'on',
      retentionDays: Number(formData.get('retentionDays') || 0),
      notificationPreferences
    };
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const response = await api('/settings', { method: 'PATCH', body: payload });
      Object.assign(state, response || {});
      if (response?.productName || payload.productName) {
        const brand = qs('#brand-name');
        if (brand) brand.textContent = String(response?.productName || payload.productName);
      }
      toast('Settings saved', 'success');
      render();
    } catch (error) {
      toast(error?.message || 'Could not save settings', 'error');
    }
  });
}

async function loadSettings() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const payload = await api('/settings');
    state.workspace = payload?.workspace || {};
    state.profile = payload?.profile || {};
    state.settings = payload?.settings || {};
    state.notificationPreferences = payload?.notificationPreferences || {};
    render();
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'settings' }).then(loadSettings).catch(showPageError);
