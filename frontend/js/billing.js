import { initApp, showPageError, qs, safeSetLoading, statCard, panel, table, badge, present, fmtNumber, fmtMoney, fmtDateTime, asArray, pick, quotaUsed, progressBar, confirmAction, toast, h, queryParams, buildQuery } from './app.js';
import { api } from './api.js';

const state = { plans: [], subscription: {}, payments: [], notice: '' };
let bound = false;

async function processQueryNotice() {
  const params = queryParams();
  if (params.has('cancel') || params.get('status') === 'cancel') {
    return '<div class="notice warning">Checkout was canceled. Your current plan is unchanged.</div>';
  }
  const tracker = params.get('tracker');
  const paymentId = params.get('payment');
  if (params.has('success') || params.get('status') === 'success') {
    try {
      if (tracker) await api(`/billing/success${buildQuery({ tracker })}`);
      if (paymentId) await api(`/billing/payments/${encodeURIComponent(paymentId)}/status`);
      return '<div class="notice success">Payment check complete. Subscription status was refreshed from the server.</div>';
    } catch (error) {
      return `<div class="notice error">Payment check failed: ${present(error?.message || 'Unknown error')}</div>`;
    }
  }
  if (paymentId) {
    try {
      await api(`/billing/payments/${encodeURIComponent(paymentId)}/status`);
      return '<div class="notice success">Payment status refreshed from the server.</div>';
    } catch (error) {
      return `<div class="notice error">Could not refresh payment status: ${present(error?.message || 'Unknown error')}</div>`;
    }
  }
  return '';
}

function currentPlanCode() {
  return pick(state.subscription, ['plan.code', 'subscription.plan.code'], '');
}

function render() {
  const root = qs('#page-content');
  const plan = pick(state.subscription, ['plan'], {}) || {};
  const quota = pick(state.subscription, ['quota'], {}) || {};
  const subscription = pick(state.subscription, ['subscription'], {}) || {};
  const used = quotaUsed(quota);
  const limit = pick(quota, ['limit'], pick(state.subscription, ['limit'], null));
  const remaining = pick(state.subscription, ['remaining'], pick(quota, ['remaining'], null));
  const percent = used !== null && limit ? (used / limit) * 100 : null;
  const activeCode = currentPlanCode();

  root.innerHTML = `
    ${state.notice}
    <section class="stat-grid">
      ${statCard('Current plan', present(plan?.name || '—'), present(subscription?.status || 'No active subscription'), 'primary')}
      ${statCard('Monthly limit', fmtNumber(limit), 'Conversations included')}
      ${statCard('Used this month', fmtNumber(used), 'Across all agents')}
      ${statCard('Remaining', fmtNumber(remaining), 'Current billing period', 'success')}
    </section>
    ${panel('Subscription', `
      <div class="detail-grid">
        <div class="detail-item"><span>Status</span><strong>${badge(subscription?.status || 'inactive')}</strong></div>
        <div class="detail-item"><span>Price</span><strong>${fmtMoney(plan?.price_pkr)}</strong></div>
        <div class="detail-item"><span>Period start</span><strong>${fmtDateTime(subscription?.current_period_start)}</strong></div>
        <div class="detail-item"><span>Period end</span><strong>${fmtDateTime(subscription?.current_period_end)}</strong></div>
      </div>
      ${percent !== null ? `<div style="margin-top:16px">${progressBar(percent, 'Conversation quota used')}</div>` : ''}
      ${subscription?.id ? '<div class="cell-actions" style="margin-top:16px"><button type="button" class="button danger" data-action="cancel">Cancel subscription</button></div>' : ''}
    `, 'Your active billing state')}
    <section class="panel">
      <div class="panel-head"><div><h2>Plans</h2><p>${fmtNumber(state.plans.length)} plans available</p></div></div>
      <div class="plan-grid">
        ${state.plans.map((item) => {
          const isCurrent = item?.code === activeCode;
          const isFree = Number(item?.price_pkr || 0) <= 0;
          return `
            <article class="plan-card${isCurrent ? ' is-current' : ''}">
              <div><h3>${present(item?.name || '—')}</h3><span class="cell-muted">${present(item?.code || '')}</span></div>
              <div class="plan-price">${fmtMoney(item?.price_pkr)}<small> / month</small></div>
              <ul class="plan-features">
                <li>${fmtNumber(item?.agent_limit)} AI agents</li>
                <li>${fmtNumber(item?.conversation_limit)} conversations / month</li>
                ${asArray(item?.features, ['features']).map((feature) => `<li>${present(typeof feature === 'string' ? feature : feature?.name || feature?.label || '')}</li>`).join('')}
              </ul>
              <button type="button" class="button ${isCurrent ? '' : 'primary'}" data-action="checkout" data-code="${h(item?.code || '')}"${isCurrent || isFree ? ' disabled' : ''}>${isCurrent ? 'Current plan' : isFree ? 'Included' : 'Choose plan'}</button>
            </article>
          `;
        }).join('')}
      </div>
    </section>
    ${panel('Payment history', table([
      { label: 'Date', key: 'created_at', render: (item) => fmtDateTime(item?.created_at) },
      { label: 'Plan', key: 'subscription_plans', render: (item) => present(item?.subscription_plans?.name || item?.plan?.name || '—') },
      { label: 'Amount', key: 'amount_pkr', render: (item) => fmtMoney(item?.amount_pkr) },
      { label: 'Status', key: 'status', render: (item) => badge(item?.status || '—') },
      { label: 'Tracker', key: 'tracker', render: (item) => `<span class="cell-muted">${present(item?.tracker || '—')}</span>` },
      { label: 'Actions', key: 'id', render: (item) => `<div class="cell-actions"><button type="button" class="button small" data-action="check-status" data-id="${h(item?.id || '')}">Check status</button></div>` }
    ], state.payments, { emptyTitle: 'No payments yet', emptyMessage: 'Checkout payments will appear here.' }), 'Recent invoices and transactions')}
  `;
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'checkout') {
      const payload = await api('/billing/checkout', { method: 'POST', body: { planCode: button.dataset.code } });
      if (!payload?.checkoutUrl) throw new Error('Checkout URL was not returned');
      window.location.assign(payload.checkoutUrl);
      return;
    }
    if (button.dataset.action === 'check-status') {
      const payload = await api(`/billing/payments/${encodeURIComponent(button.dataset.id)}/status`);
      toast(`Payment status: ${payload?.payment?.status || 'unknown'}`, 'success');
      await loadBilling();
      return;
    }
    if (button.dataset.action === 'cancel') {
      if (!confirmAction('Cancel your subscription at the end of the current period?')) return;
      await api('/billing/cancel', { method: 'POST', body: {} });
      toast('Subscription cancellation scheduled', 'success');
      await loadBilling();
    }
  } catch (error) {
    toast(error?.message || 'Billing action failed', 'error');
  }
}

async function loadBilling() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const [plans, subscription, payments] = await Promise.all([
      api('/plans'),
      api('/billing/subscription'),
      api('/billing/payments')
    ]);
    state.plans = asArray(plans, ['plans']);
    state.subscription = subscription || {};
    state.payments = asArray(payments, ['payments']);
    if (!state.notice) state.notice = await processQueryNotice();
    render();
    if (!bound) {
      document.addEventListener('click', handleClick);
      bound = true;
    }
    const params = queryParams();
    if (params.has('success') || params.has('cancel') || params.has('payment')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'billing' }).then(loadBilling).catch(showPageError);
