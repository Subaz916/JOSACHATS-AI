import { initApp, showPageError, qs, safeSetLoading, statCard, panel, table, badge, present, fmtNumber, fmtDateTime, asArray, pick, objectToPairs, barChart, donutChart, buildQuery } from './app.js';
import { api } from './api.js';

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const state = defaultRange();

function render(data) {
  const root = qs('#page-content');
  const daily = objectToPairs(data?.dailyConversations).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const languages = objectToPairs(data?.languageDistribution);
  const channels = objectToPairs(data?.channelDistribution);
  const questions = asArray(data?.topQuestions, ['topQuestions']);
  const unanswered = asArray(data?.unansweredQuestions, ['unansweredQuestions']);
  const agentUsage = asArray(data?.agentUsage, ['agentUsage']);
  const satisfaction = pick(data, ['satisfaction'], {});

  root.innerHTML = `
    <div class="toolbar">
      <div class="field"><label for="analytics-from">From</label><input id="analytics-from" type="date" value="${state.from}"></div>
      <div class="field"><label for="analytics-to">To</label><input id="analytics-to" type="date" value="${state.to}"></div>
      <button type="button" class="button primary" id="analytics-apply">Apply range</button>
    </div>
    <section class="kpi-grid">
      ${statCard('Total conversations', fmtNumber(data?.totalConversations), 'Selected range', 'primary')}
      ${statCard('Satisfaction', satisfaction?.average === null || satisfaction?.average === undefined ? '—' : `${fmtNumber(satisfaction.average)} / 5`, `${fmtNumber(satisfaction?.count)} ratings`, 'success')}
      ${statCard('Unanswered questions', fmtNumber(unanswered.length), 'Needs knowledge updates', 'warning')}
      ${statCard('Active agents', fmtNumber(agentUsage.length), 'With conversations in range')}
    </section>
    ${panel('Daily conversations', barChart(daily, { label: 'Daily conversations' }), 'Activity over the selected range')}
    <div class="two-column">
      ${panel('Language distribution', donutChart(languages, { label: 'Language distribution' }), 'Conversations by language')}
      ${panel('Channel distribution', donutChart(channels, { label: 'Channel distribution' }), 'Conversations by channel')}
    </div>
    <div class="two-column">
      ${panel('Top questions', table([
        { label: 'Question', key: 'question', render: (item) => `<span class="cell-strong">${present(item?.question || '—')}</span>` },
        { label: 'Count', key: 'count', render: (item) => fmtNumber(item?.count) },
        { label: 'Last seen', key: 'lastSeen', render: (item) => fmtDateTime(item?.lastSeen) }
      ], questions, { emptyTitle: 'No questions recorded', emptyMessage: 'Questions will appear after customer activity.' }), 'Most repeated customer questions')}
      ${panel('Agent usage', barChart(agentUsage.map((item) => ({ label: item?.agentName || 'Unknown agent', value: item?.count || 0 })), { label: 'Agent usage' }), 'Conversations handled by agent')}
    </div>
    ${panel('Unanswered questions', table([
      { label: 'Question', key: 'question', render: (item) => present(item?.question || '—') },
      { label: 'Conversation', key: 'conversationId', render: (item) => `<span class="cell-muted">${present(item?.conversationId || '—')}</span>` },
      { label: 'Status', key: 'id', render: () => badge('open') },
      { label: 'Created', key: 'createdAt', render: (item) => fmtDateTime(item?.createdAt) }
    ], unanswered, { emptyTitle: 'No unanswered questions', emptyMessage: 'Every customer question received a response.' }), 'Gaps to fix in your knowledge base')}
  `;
  bindRange();
}

function bindRange() {
  qs('#analytics-from')?.addEventListener('change', (event) => {
    state.from = event.target.value;
  });
  qs('#analytics-to')?.addEventListener('change', (event) => {
    state.to = event.target.value;
  });
  qs('#analytics-apply')?.addEventListener('click', loadAnalytics);
}

async function loadAnalytics() {
  const root = qs('#page-content');
  safeSetLoading(root, true);
  try {
    const data = await api(`/analytics${buildQuery({ from: state.from, to: state.to })}`);
    render(data);
  } catch (error) {
    showPageError(error);
  } finally {
    safeSetLoading(root, false);
  }
}

initApp({ active: 'analytics' }).then(loadAnalytics).catch(showPageError);
