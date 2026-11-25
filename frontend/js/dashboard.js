import { initApp, showPageError, qs, safeSetLoading, statCard, panel, table, badge, present, fmtNumber, fmtDate, fmtDateTime, asArray, pick, barChart, donutChart, quotaUsed, progressBar } from './app.js';
import { api } from './api.js';

async function renderDashboard() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const data = await api('/dashboard/overview');
    const agents = pick(data, ['agents'], {});
    const conversations = pick(data, ['conversations'], {});
    const interactions = pick(data, ['interactions'], {});
    const quota = pick(data, ['quota'], {});
    const used = quotaUsed(quota);
    const limit = pick(quota, ['limit'], null);
    const remaining = pick(quota, ['remaining'], null);
    const percent = used !== null && limit ? (used / limit) * 100 : null;
    const recent = asArray(data?.recentConversations, ['recentConversations']);
    const performance = asArray(data?.agentPerformance, ['agentPerformance']);
    const planName = pick(data, ['plan.name', 'subscription.plan.name', 'plan.code'], '—');

    root.innerHTML = `
      <section class="stat-grid">
        ${statCard('Total agents', fmtNumber(agents?.total), `${fmtNumber(agents?.active)} active`, 'primary')}
        ${statCard('Conversations', fmtNumber(conversations?.total), `${fmtNumber(conversations?.monthly)} this month`)}
        ${statCard('Voice interactions', fmtNumber(interactions?.voice), 'From monthly usage')}
        ${statCard('Text interactions', fmtNumber(interactions?.text), 'From monthly usage')}
      </section>
      ${panel('Monthly quota', `
        <div class="detail-grid">
          <div class="detail-item"><span>Plan</span><strong>${present(planName)}</strong></div>
          <div class="detail-item"><span>Used</span><strong>${fmtNumber(used)}</strong></div>
          <div class="detail-item"><span>Remaining</span><strong>${fmtNumber(remaining)}</strong></div>
          <div class="detail-item"><span>Limit</span><strong>${fmtNumber(limit)}</strong></div>
        </div>
        ${percent !== null ? progressBar(percent, 'Conversation quota used') : ''}
      `, 'Current billing period')}
      <div class="two-column">
        ${panel('Interaction channels', donutChart([
          { label: 'Voice', value: interactions?.voice || 0 },
          { label: 'Text', value: interactions?.text || 0 }
        ], { label: 'Voice and text interactions' }), 'Real monthly usage')}
        ${panel('Agent performance', barChart(performance.map((item) => ({
          label: item?.agentName || item?.name || item?.agentSlug || '—',
          value: item?.total ?? item?.conversations ?? 0
        })), { label: 'Conversations by agent' }), 'Conversations handled per agent')}
      </div>
      ${panel('Recent conversations', table([
        { label: 'Customer', key: 'customer_identifier', render: (row) => `<span class="cell-strong">${present(row?.customer_identifier || row?.customerIdentifier || '—')}</span>` },
        { label: 'Agent', key: 'agentName', render: (row) => present(row?.agentName || row?.agents?.name || row?.agentSlug || '—') },
        { label: 'Channel', key: 'channel', render: (row) => present(row?.channel || '—') },
        { label: 'Status', key: 'status', render: (row) => badge(row?.status || '—') },
        { label: 'Last message', key: 'lastMessage', render: (row) => `<span class="cell-muted">${present(row?.lastMessage || '—')}</span>` },
        { label: 'Updated', key: 'lastMessageAt', render: (row) => fmtDateTime(row?.lastMessageAt || row?.updated_at) }
      ], recent, { emptyTitle: 'No conversations yet', emptyMessage: 'Conversations will appear as customers reach your agents.' }), 'Latest activity across all agents')}
      ${panel('Agent performance', table([
        { label: 'Agent', key: 'agentName', render: (row) => `<span class="cell-strong">${present(row?.agentName || row?.name || '—')}</span>` },
        { label: 'Status', key: 'status', render: (row) => badge(row?.status || '—') },
        { label: 'Total', key: 'total', render: (row) => fmtNumber(row?.total) },
        { label: 'Open', key: 'open', render: (row) => fmtNumber(row?.open) },
        { label: 'Pending', key: 'pending', render: (row) => fmtNumber(row?.pending) },
        { label: 'Resolved', key: 'resolved', render: (row) => fmtNumber(row?.resolved) },
        { label: 'Archived', key: 'archived', render: (row) => fmtNumber(row?.archived) }
      ], performance, { emptyTitle: 'No agents yet', emptyMessage: 'Create an agent to start tracking performance.' }), 'Status breakdown by agent')}
    `;
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'overview' }).then(renderDashboard).catch(showPageError);
