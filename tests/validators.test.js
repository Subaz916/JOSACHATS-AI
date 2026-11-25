import test from 'node:test';
import assert from 'node:assert/strict';
import { agentSchema, knowledgeSchema, checkoutSchema } from '../backend/validators/schemas.js';

const validAgent = {
  name: 'Test Agent',
  businessName: 'Test Business',
  businessCategory: 'Restaurant',
  businessDescription: 'A restaurant with delivery and dine in service.',
  businessEmail: 'hello@example.com'
};

test('agentSchema accepts a minimal valid agent', () => {
  const result = agentSchema.safeParse(validAgent);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.languages, ['en']);
    assert.equal(result.data.voice.provider, 'browser');
    assert.equal(result.data.settings.voiceInput, true);
  }
});

test('agentSchema rejects unsupported language', () => {
  const result = agentSchema.safeParse({ ...validAgent, languages: ['fr'] });
  assert.equal(result.success, false);
});

test('knowledgeSchema accepts manual and url sources', () => {
  assert.equal(knowledgeSchema.safeParse({ title: 'Hours', type: 'manual', content: 'Open daily' }).success, true);
  assert.equal(knowledgeSchema.safeParse({ title: 'Site', type: 'url', url: 'https://example.com' }).success, true);
});

test('checkoutSchema requires a plan code', () => {
  assert.equal(checkoutSchema.safeParse({}).success, false);
  assert.equal(checkoutSchema.safeParse({ planCode: 'starter' }).success, true);
});
