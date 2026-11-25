import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
process.env.AI_API_URL = 'https://api.example.com/v1';
process.env.AI_API_KEY = 'ai-test-key';
process.env.AI_MODEL = 'test-model';
process.env.SAFEPAY_SECRET_KEY = 'safepay-secret-test';
process.env.SAFEPAY_PUBLIC_KEY = 'safepay-public-test';
process.env.SAFEPAY_WEBHOOK_SECRET = 'webhook-secret-test';
process.env.SAFEPAY_SANDBOX = 'true';
process.env.SAFEPAY_PRODUCTION_ENABLED = 'false';

const { publicConfig, capabilities } = await import('../backend/config/env.js');

test('publicConfig never exposes secrets', () => {
  const config = publicConfig();
  const serialized = JSON.stringify(config);
  assert.equal(config.productName, 'JOSA CHATS');
  assert.equal(config.auth.supabaseUrl, 'https://example.supabase.co');
  assert.ok(!serialized.includes('service-test-key'));
  assert.ok(!serialized.includes('ai-test-key'));
  assert.ok(!serialized.includes('safepay-secret-test'));
  assert.equal(config.capabilities.safepaySandbox, true);
  assert.equal(capabilities.safepay, true);
});
