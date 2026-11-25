import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.SAFEPAY_SECRET_KEY = 'safepay-secret-test';
process.env.SAFEPAY_PUBLIC_KEY = 'safepay-public-test';
process.env.SAFEPAY_WEBHOOK_SECRET = 'webhook-secret-test';
process.env.SAFEPAY_SANDBOX = 'true';
process.env.SAFEPAY_PRODUCTION_ENABLED = 'false';

const { verifyWebhookSignature } = await import('../backend/integrations/safepay/service.js');

test('Safepay HMAC signature accepted', () => {
  const body = Buffer.from('{"type":"payment.succeeded"}');
  const signature = createHmac('sha512', 'webhook-secret-test').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature), true);
});

test('Safepay HMAC signature rejected when altered', () => {
  const body = Buffer.from('{"type":"payment.succeeded"}');
  const signature = createHmac('sha512', 'wrong-secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature), false);
});
