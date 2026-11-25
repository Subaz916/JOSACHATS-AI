import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../config/supabase.js';
import { workspaceFor, requireUuid } from './shared.js';
import { quotaSummary, getSubscriptionState, getMonthlyUsage } from '../services/quota.js';
import { notify, audit } from '../services/notifications.js';
import { createHostedCheckout, fetchTracker, trackerIsPaid, verifyWebhookSignature } from '../integrations/safepay/service.js';
import { env, capabilities } from '../config/env.js';
import { HttpError, notFound } from '../utils/http-error.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function serviceDb() {
  const db = getServiceClient();
  if (!db) throw new HttpError(503, 'Database service is not configured');
  return db;
}

function readError(error, fallback) {
  throw new Error(error?.message || fallback);
}

async function loadPayment(db, id, workspaceId = null) {
  let query = db.from('payments').select('*').eq('id', id);
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error) readError(error, 'Could not read payment');
  return data || null;
}

function trackerToken(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') return String(value.token || value.tracker || value.value || '').trim();
  return '';
}

function webhookTracker(event) {
  const data = event?.data || {};
  return trackerToken(data.tracker || data.tracker_token || data.trackerToken || event?.tracker);
}

function webhookAmount(event) {
  const data = event?.data || {};
  const candidates = [data.amount, data.amountPkr, data.amount_pkr, data.total, data.payment?.amount, data.payment?.amount_pkr];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

function amountMatches(payment, amount) {
  if (amount === null) return true;
  const expected = Number(payment.amount_pkr || 0);
  if (!expected) return false;
  const minor = Math.round(expected * 100);
  return Math.abs(amount - expected) < 0.01 || Math.abs(amount - minor) < 0.01 || Math.abs(amount / 100 - expected) < 0.01;
}

function isDuplicateError(error) {
  return error?.code === '23505' || /duplicate|unique/i.test(error?.message || '');
}

async function setPaymentStatus(db, payment, status, eventToken, extra = {}) {
  const now = new Date().toISOString();
  const update = {
    status,
    event_token: eventToken || payment.event_token,
    metadata: { ...(payment.metadata || {}), ...(extra.metadata || {}), last_event: eventToken || null },
    updated_at: now
  };
  if (status === 'succeeded') update.paid_at = extra.paidAt || payment.paid_at || now;
  if (extra.subscriptionId) update.subscription_id = extra.subscriptionId;
  const { data, error } = await db.from('payments').update(update).eq('id', payment.id).select('*').single();
  if (error) readError(error, 'Could not update payment');
  return data;
}

export async function activatePaidPayment(db, payment, options = {}) {
  const current = await loadPayment(db, payment.id);
  if (!current) throw notFound('Payment not found');
  if (current.status === 'succeeded' && current.subscription_id) return current;
  if (!current.plan_id) throw new HttpError(400, 'Payment has no plan');

  const now = new Date();
  const timestamp = now.toISOString();
  let subscription = null;

  if (current.subscription_id) {
    const { data, error } = await db.from('subscriptions').select('*').eq('id', current.subscription_id).maybeSingle();
    if (error) readError(error, 'Could not read subscription');
    subscription = data || null;
  }

  if (!subscription) {
    const { data, error } = await db.from('subscriptions')
      .select('*')
      .eq('workspace_id', current.workspace_id)
      .eq('plan_id', current.plan_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) readError(error, 'Could not read subscription');
    subscription = data || null;
  }

  const subscriptionFields = {
    workspace_id: current.workspace_id,
    plan_id: current.plan_id,
    status: 'active',
    provider: 'safepay',
    provider_subscription_id: options.tracker || current.tracker || null,
    current_period_start: timestamp,
    current_period_end: new Date(now.getTime() + THIRTY_DAYS_MS).toISOString(),
    cancel_at_period_end: false,
    updated_at: timestamp
  };

  if (subscription) {
    const { data, error } = await db.from('subscriptions').update(subscriptionFields).eq('id', subscription.id).select('*').single();
    if (error) readError(error, 'Could not update subscription');
    subscription = data;
  } else {
    const { data, error } = await db.from('subscriptions').insert({ ...subscriptionFields, created_at: timestamp }).select('*').single();
    if (error) readError(error, 'Could not create subscription');
    subscription = data;
  }

  await db.from('subscriptions')
    .update({ status: 'canceled', cancel_at_period_end: true, updated_at: timestamp })
    .eq('workspace_id', current.workspace_id)
    .in('status', ['active', 'trialing'])
    .neq('id', subscription.id);

  const updated = await setPaymentStatus(db, current, 'succeeded', options.eventToken || null, {
    subscriptionId: subscription.id,
    paidAt: current.paid_at || timestamp,
    metadata: { activated_at: timestamp, tracker: options.tracker || current.tracker }
  });

  await notify(db, {
    workspaceId: current.workspace_id,
    userId: null,
    type: 'payment_succeeded',
    title: 'Payment received',
    body: 'Subscription activated successfully.',
    data: { paymentId: current.id, subscriptionId: subscription.id }
  }).catch(() => null);

  await audit(db, {
    workspaceId: current.workspace_id,
    actorId: null,
    action: 'subscription.activated',
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: { paymentId: current.id, tracker: options.tracker || current.tracker }
  }).catch(() => null);

  return updated;
}

export async function getPlans(req, res) {
  const db = serviceDb();
  const { data, error } = await db.from('subscription_plans')
    .select('id,code,name,price_pkr,agent_limit,conversation_limit,features,is_active,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) readError(error, 'Could not list plans');
  res.json({ plans: data || [] });
}

export async function getSubscription(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const workspaceId = workspace.workspace_id;
  const [summary, state, usage] = await Promise.all([
    quotaSummary(req.db, workspaceId),
    getSubscriptionState(req.db, workspaceId),
    getMonthlyUsage(req.db, workspaceId)
  ]);
  res.json({
    subscription: state.subscription,
    plan: state.plan,
    quota: summary,
    usage,
    remaining: summary.remaining,
    limit: summary.limit
  });
}

export async function createCheckout(req, res) {
  const db = serviceDb();
  const workspace = await workspaceFor(req.db, req.user.id);
  const planCode = String(req.body.planCode || '').trim();
  const { data: plan, error: planError } = await db.from('subscription_plans')
    .select('*')
    .eq('code', planCode)
    .eq('is_active', true)
    .maybeSingle();
  if (planError) readError(planError, 'Could not read plan');
  if (!plan) throw notFound('Plan not found');
  if (plan.code === 'free' || Number(plan.price_pkr) <= 0) throw new HttpError(400, 'Free plans do not require checkout');

  const { subscription: currentSubscription } = await getSubscriptionState(req.db, workspace.workspace_id);
  const metadata = {
    planCode,
    planId: plan.id,
    workspaceId: workspace.workspace_id,
    userId: req.user.id,
    source: 'billing-checkout'
  };
  const { data: payment, error: paymentError } = await db.from('payments').insert({
    workspace_id: workspace.workspace_id,
    subscription_id: currentSubscription?.id || null,
    plan_id: plan.id,
    provider: 'safepay',
    tracker: `pending_${randomUUID()}`,
    event_token: `pending_${randomUUID()}`,
    amount_pkr: plan.price_pkr,
    status: 'pending',
    metadata
  }).select('id').single();
  if (paymentError) readError(paymentError, 'Could not create payment');

  const checkout = await createHostedCheckout({ paymentId: payment.id, planCode, amountPkr: plan.price_pkr });
  const { data: storedPayment, error: updateError } = await db.from('payments').update({
    tracker: checkout.tracker,
    checkout_url: checkout.checkoutUrl,
    amount_minor: checkout.amountMinor,
    metadata: { ...metadata, tracker: checkout.tracker }
  }).eq('id', payment.id).select('*').single();
  if (updateError) readError(updateError, 'Could not update payment');

  await notify(db, {
    workspaceId: workspace.workspace_id,
    userId: req.user.id,
    type: 'checkout_started',
    title: 'Checkout started',
    body: `Checkout for ${plan.name} is ready.`,
    data: { paymentId: payment.id, tracker: checkout.tracker }
  }).catch(() => null);

  res.json({
    checkoutUrl: checkout.checkoutUrl,
    paymentId: payment.id,
    tracker: checkout.tracker,
    sandbox: env.safepaySandbox
  });
}

export async function getPayments(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data, error } = await db.from('payments')
    .select('*, subscription_plans(code,name,price_pkr)')
    .eq('workspace_id', workspace.workspace_id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) readError(error, 'Could not list payments');
  res.json({ payments: data || [] });
}

export async function getPaymentStatus(req, res) {
  const id = requireUuid(req.params.id, 'payment id');
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  let payment = await loadPayment(db, id, workspace.workspace_id);
  if (!payment) throw notFound('Payment not found');

  if (payment.status === 'pending' && payment.tracker && !payment.tracker.startsWith('pending_')) {
    const trackerData = await fetchTracker(payment.tracker);
    if (trackerIsPaid(trackerData)) payment = await activatePaidPayment(db, payment, { tracker: payment.tracker });
  }

  res.json({ payment });
}

export async function cancelSubscription(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const { data: subscription, error } = await db.from('subscriptions')
    .select('*')
    .eq('workspace_id', workspace.workspace_id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) readError(error, 'Could not read subscription');
  if (!subscription) throw notFound('No active subscription found');

  const { data: updated, error: updateError } = await db.from('subscriptions')
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq('id', subscription.id)
    .select('*')
    .single();
  if (updateError) readError(updateError, 'Could not cancel subscription');

  await audit(db, {
    workspaceId: workspace.workspace_id,
    actorId: req.user.id,
    action: 'subscription.cancel',
    entityType: 'subscription',
    entityId: subscription.id,
    metadata: { cancelAtPeriodEnd: true }
  }).catch(() => null);

  res.json({ subscription: updated });
}

export async function billingSuccess(req, res) {
  const workspace = await workspaceFor(req.db, req.user.id);
  const db = serviceDb();
  const tracker = trackerToken(req.query.tracker);

  if (tracker && !tracker.startsWith('pending_')) {
    let trackerData = null;
    try {
      trackerData = await fetchTracker(tracker);
    } catch {
      trackerData = null;
    }
    if (trackerData && trackerIsPaid(trackerData)) {
      const { data: payment, error } = await db.from('payments')
        .select('*')
        .eq('workspace_id', workspace.workspace_id)
        .eq('tracker', tracker)
        .maybeSingle();
      if (error) readError(error, 'Could not read payment');
      if (payment) await activatePaidPayment(db, payment, { tracker });
    }
  }

  const state = await getSubscriptionState(req.db, workspace.workspace_id);
  res.json({
    status: state.subscription?.status || 'free',
    subscription: state.subscription,
    plan: state.plan
  });
}

export async function getBillingConfig(req, res) {
  res.json({
    sandbox: env.safepaySandbox,
    productionEnabled: env.safepayProductionEnabled,
    configured: capabilities.safepay
  });
}

async function processWebhookEvent(db, event) {
  const type = String(event.type || '');
  const tracker = webhookTracker(event);
  if (!tracker) return { processed: false, reason: 'Tracker missing' };

  const { data: payment, error } = await db.from('payments').select('*').eq('tracker', tracker).maybeSingle();
  if (error) readError(error, 'Could not read payment');
  if (!payment) return { processed: false, reason: 'Payment not found' };

  if (type === 'payment.succeeded' || type === 'payment_succeeded' || type === 'payment.success') {
    if (!amountMatches(payment, webhookAmount(event))) return { processed: false, reason: 'Amount mismatch' };
    await activatePaidPayment(db, payment, { eventToken: event.token, tracker });
    return { processed: true, reason: null };
  }

  if (type === 'payment.failed' || type === 'payment_failed') {
    if (payment.status === 'succeeded') return { processed: true, reason: 'Payment already succeeded' };
    await setPaymentStatus(db, payment, 'failed', event.token, { metadata: { failed_event: event.token } });
    return { processed: true, reason: null };
  }

  if (type === 'payment.refunded' || type === 'payment_refunded') {
    await setPaymentStatus(db, payment, 'refunded', event.token, { metadata: { refund_event: event.token } });
    return { processed: true, reason: null };
  }

  return { processed: true, reason: 'Event type ignored' };
}

export async function safepayWebhook(req, res) {
  let raw;
  if (Buffer.isBuffer(req.body)) raw = req.body;
  else if (Buffer.isBuffer(req.body?.rawBody)) raw = req.body.rawBody;
  else if (typeof req.body === 'string') raw = Buffer.from(req.body);
  else raw = Buffer.from(JSON.stringify(req.body || {}));

  if (!verifyWebhookSignature(raw, req.headers['x-sfpy-signature'])) throw new HttpError(401, 'Invalid webhook signature');

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid webhook payload');
  }
  if (!event?.token) throw new HttpError(400, 'Webhook token is required');

  const db = serviceDb();
  const { error: eventError } = await db.from('webhook_events').insert({
    event_token: event.token,
    type: event.type || 'unknown',
    payload: event,
    status: 'received'
  });
  if (eventError) {
    if (isDuplicateError(eventError)) return res.json({ received: true, duplicate: true });
    readError(eventError, 'Could not store webhook event');
  }

  let processed = false;
  let reason = null;
  try {
    const result = await processWebhookEvent(db, event);
    processed = result.processed;
    reason = result.reason || null;
  } catch (error) {
    reason = error?.message || 'Webhook processing failed';
  }

  const { error: updateError } = await db.from('webhook_events').update({
    status: processed ? 'processed' : 'failed',
    error: reason,
    processed_at: new Date().toISOString()
  }).eq('event_token', event.token);
  if (updateError) readError(updateError, 'Could not update webhook event');

  res.json({ received: true, duplicate: false, processed, reason });
}
