import { api, qs, qsa, escapeHtml, formatDate, formatMoney, statusBadge, emptyState, toast, requireSession, logout, applyTheme } from '../../js/core.js';

const TABS = ['Overview', 'Users', 'Plans', 'Agents', 'Payments', 'Logs', 'System Settings'];
let active = 'Overview';

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">${emptyState('No records found')}</td></tr>`}</tbody></table></div>`;
}

function renderNav() {
  qs('#admin-nav').innerHTML = TABS.map((tab) => `<button class="${tab === active ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('');
  qsa('[data-tab]').forEach((button) => button.addEventListener('click', () => { active = button.dataset.tab; qs('#admin-title').textContent = `Admin · ${active}`; renderNav(); load(); }));
}

async function load() {
  const view = qs('#admin-view');
  try {
    const endpoint = active === 'System Settings' ? '/api/system/settings' : `/api/admin/${active.toLowerCase().replace(' ', '-')}`;
    const data = await api(endpoint);
    if (active === 'Overview') {
      view.innerHTML = `<div class="grid four">${Object.entries(data).map(([key, value]) => `<div class="card kpi"><span class="muted">${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</span><span class="value">${typeof value === 'number' ? value.toLocaleString() : escapeHtml(String(value))}</span></div>`).join('')}</div>`;
    } else if (active === 'Users') {
      const users = data.users || [];
      view.innerHTML = table(['User', 'Email', 'Status', 'Admin', 'Workspaces', 'Agents', 'Plan', 'Actions'], users.map((user) => `<tr><td>${escapeHtml(user.full_name || '—')}</td><td>${escapeHtml(user.email || '')}</td><td>${statusBadge(user.status)}</td><td>${user.is_admin ? 'Yes' : 'No'}</td><td>${Number(user.workspaceCount || 0)}</td><td>${Number(user.agentCount || 0)}</td><td>${escapeHtml(user.plan?.name || '—')}</td><td><select data-user="${user.id}"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option></select></td></tr>`).join(''));
      qsa('[data-user]', view).forEach((select) => select.addEventListener('change', async () => {
        try { await api(`/api/admin/users/${select.dataset.user}`, { method: 'PATCH', body: { status: select.value } }); toast('User updated', 'success'); }
        catch (error) { toast(error.message, 'error'); }
      }));
    } else if (active === 'Plans') {
      const plans = data.plans || [];
      view.innerHTML = plans.map((plan) => `<div class="card" style="margin-bottom:14px"><div class="grid four"><label>Name<input value="${escapeHtml(plan.name)}" data-plan="${plan.id}" data-field="name"></label><label>Price<input type="number" value="${Number(plan.price_pkr || 0)}" data-plan="${plan.id}" data-field="pricePkr"></label><label>Agent limit<input type="number" value="${Number(plan.agent_limit || 0)}" data-plan="${plan.id}" data-field="agentLimit"></label><label>Conversation limit<input type="number" value="${Number(plan.conversation_limit || 0)}" data-plan="${plan.id}" data-field="conversationLimit"></label></div><label class="check"><input type="checkbox" data-plan="${plan.id}" data-field="isActive" ${plan.is_active ? 'checked' : ''}> Active</label><button class="btn primary small" data-save-plan="${plan.id}">Save</button></div>`).join('') || emptyState('No plans');
      qsa('[data-save-plan]', view).forEach((button) => button.addEventListener('click', async () => {
        const id = button.dataset.savePlan;
        const body = {};
        qsa(`[data-plan="${id}"]`, view).forEach((input) => { body[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; });
        try { await api(`/api/admin/plans/${id}`, { method: 'PATCH', body }); toast('Plan saved', 'success'); }
        catch (error) { toast(error.message, 'error'); }
      }));
    } else if (active === 'Agents' || active === 'Payments' || active === 'Logs') {
      const rows = data.agents || data.payments || data.logs || [];
      const headers = active === 'Agents' ? ['Name', 'Business', 'Status', 'Created'] : active === 'Payments' ? ['Tracker', 'Amount', 'Status', 'Created'] : ['Action', 'Entity', 'Actor', 'Created'];
      view.innerHTML = table(headers, rows.map((row) => active === 'Agents'
        ? `<tr><td>${escapeHtml(row.name || '')}</td><td>${escapeHtml(row.business_name || '—')}</td><td>${statusBadge(row.status)}</td><td>${formatDate(row.created_at)}</td></tr>`
        : active === 'Payments'
          ? `<tr><td>${escapeHtml(row.tracker || '—')}</td><td>${formatMoney(row.amount_pkr)}</td><td>${statusBadge(row.status)}</td><td>${formatDate(row.created_at)}</td></tr>`
          : `<tr><td>${escapeHtml(row.action || '')}</td><td>${escapeHtml(row.entity_type || '—')}</td><td>${escapeHtml(row.actor_id || '—')}</td><td>${formatDate(row.created_at)}</td></tr>`).join(''));
    } else {
      const settings = data.settings || {};
      view.innerHTML = `<form class="card stack" id="system-form">${Object.entries(settings).map(([key, value]) => `<label>${escapeHtml(key)}<input name="${escapeHtml(key)}" value="${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}"></label>`).join('')}<button class="btn primary" type="submit">Save settings</button></form>`;
      qs('#system-form', view).onsubmit = async (event) => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(event.currentTarget));
        Object.entries(body).forEach(([key, value]) => {
          if (value === 'true') body[key] = true;
          else if (value === 'false') body[key] = false;
          else if (/^[\[{]/.test(value)) {
            try { body[key] = JSON.parse(value); } catch { body[key] = value; }
          }
        });
        try { await api('/api/system/settings', { method: 'PATCH', body }); toast('System settings saved', 'success'); }
        catch (error) { toast(error.message, 'error'); }
      };
    }
  } catch (error) {
    if (error.status === 401 || error.status === 403) view.innerHTML = `<div class="card"><h2>Access denied</h2><p>Admin access is required.</p><a class="btn" href="/dashboard.html">Back to dashboard</a></div>`;
    else view.innerHTML = `<div class="card"><strong>Could not load ${escapeHtml(active)}.</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

document.getElementById('admin-logout').addEventListener('click', logout);
applyTheme();
const session = await requireSession();
if (session) { renderNav(); load(); }
