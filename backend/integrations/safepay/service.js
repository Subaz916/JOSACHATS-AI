import { createHmac, timingSafeEqual } from 'node:crypto';
import Safepay from '@sfpy/node-core';
import { env, capabilities } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';

let client;

function environmentName() {
  return env.safepaySandbox ? 'sandbox' : 'production';
}

function getClient() {
  if (!capabilities.safepay) {
    throw new HttpError(503, 'Safepay is not configured or production mode is disabled.');
  }
  if (!client) {
    client = Safepay(env.safepaySecretKey, {
      authType: 'secret',
      host: env.safepaySandbox ? 'sandbox.api.getsafepay.com' : 'api.getsafepay.com'
    });
  }
  return client;
}

function firstValue(value) {
  if (typeof value === 'string') return value;
  if (value?.data && typeof value.data === 'string') return value.data;
  if (value?.token) return value.token;
  return null;
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!capabilities.safepay || !rawBody || !signature) return false;
  const expected = createHmac('sha512', env.safepayWebhookSecret).update(rawBody).digest('hex');
  const received = String(signature).trim().toLowerCase();
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

export async function createHostedCheckout({ paymentId, planCode, amountPkr }) {
  const safepay = getClient();
  const amountMinor = Math.round(Number(amountPkr) * 100);
  let session;
  let passport;
  try {
    session = await safepay.payments.session.setup({
      merchant_api_key: env.safepayPublicKey,
      intent: env.safepayIntent,
      mode: 'payment',
      entry_mode: 'raw',
      currency: 'PKR',
      amount: amountMinor,
      metadata: { order_id: paymentId, plan_code: planCode, source: 'josa-chats' }
    });
    passport = await safepay.client.passport.create();
  } catch (error) {
    throw new HttpError(502, `Safepay checkout could not be created: ${error.message}`);
  }
  const tracker = session?.data?.tracker?.token || session?.tracker?.token;
  const tbt = firstValue(passport);
  if (!tracker || !tbt) throw new HttpError(502, 'Safepay returned an incomplete checkout session');
  const checkoutUrl = safepay.checkout.createCheckoutUrl({
    env: environmentName(),
    tracker,
    tbt,
    source: 'hosted',
    redirect_url: env.safepaySuccessUrl,
    cancel_url: env.safepayCancelUrl
  });
  return { tracker, checkoutUrl, amountMinor };
}

export async function fetchTracker(tracker) {
  const safepay = getClient();
  try {
    const response = await safepay.reporter.payments.fetch(tracker);
    return response?.data || response || {};
  } catch (error) {
    throw new HttpError(502, `Safepay tracker lookup failed: ${error.message}`);
  }
}

export function trackerIsPaid(trackerData) {
  const state = trackerData?.tracker?.state || trackerData?.state;
  return state === 'TRACKER_ENDED';
}

export function webhookAmount(event) {
  const amount = event?.data?.amount;
  const numeric = Number(amount || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
